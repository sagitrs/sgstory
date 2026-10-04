"""Production build.py asset tests; temporary stories, no shared build/dist writes."""
import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("sgstory_build", ROOT / "build.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
SVG = b'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80" viewBox="0 0 64 80"><path d="M0 0L64 80" fill="none" stroke="#fff"/></svg>'


class StoryAssetsTest(unittest.TestCase):
    def setUp(self):
        temporary_root = Path(os.environ.get("TMPDIR") or str(Path.home() / "tmp"))
        temporary_root.mkdir(parents=True, exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(prefix="sgstory-assets-", dir=temporary_root)
        self.addCleanup(self.tmp.cleanup)
        self.story = Path(self.tmp.name) / "story"
        (self.story / "src").mkdir(parents=True)
        (self.story / "assets").mkdir()
        (self.story / "assets" / "sample.svg").write_bytes(SVG)
        (self.story / "src" / "start.twee").write_text(":: 开始\n文字回退。\n", encoding="utf-8")

    def manifest(self, assets):
        (self.story / "story.json").write_text(json.dumps({"assets": assets}), encoding="utf-8")

    def rejected(self, assets, fragment="sample"):
        self.manifest(assets)
        with self.assertRaisesRegex(SystemExit, fragment):
            build.story_assets_js(self.story)

    def test_missing_and_empty_assets_do_not_inject(self):
        self.assertIsNone(build.story_assets_js(self.story))
        self.manifest({})
        self.assertIsNone(build.story_assets_js(self.story))

    def test_descriptor_contains_exact_bytes_dimensions_and_hash(self):
        self.manifest({"sample": "assets/sample.svg"})
        value = build.load_story_assets(self.story)["sample"]
        self.assertEqual(base64.b64decode(value["src"].split(",", 1)[1]), SVG)
        self.assertEqual((value["width"], value["height"]), (64, 80))
        self.assertEqual(value["sha256"], hashlib.sha256(SVG).hexdigest())
        self.assertEqual(value["mime"], "image/svg+xml")

    def test_order_is_deterministic_and_descriptors_are_frozen(self):
        self.manifest({"z": "assets/sample.svg", "a": "assets/sample.svg"})
        first = build.story_assets_js(self.story)
        self.manifest({"a": "assets/sample.svg", "z": "assets/sample.svg"})
        self.assertEqual(first, build.story_assets_js(self.story))
        self.assertIn("Object.freeze", first)
        self.assertIn("Object.create(null)", first)

    def test_javascript_registry_is_read_only_and_has_no_prototype(self):
        self.manifest({"sample": "assets/sample.svg"})
        script = build.story_assets_js(self.story)
        probe = """const vm = require('node:vm'); const context = {setup: {}};
        vm.runInNewContext(process.argv[1], context, {timeout: 1000});
        const table = context.setup.storyAssets;
        const before = table.sample.src;
        vm.runInNewContext("setup.storyAssets.sample.src = 'changed'; setup.storyAssets = {};", context);
        console.log(JSON.stringify({frozen: Object.isFrozen(table) && Object.isFrozen(table.sample),
            nullPrototype: Object.getPrototypeOf(table) === null,
            unchanged: context.setup.storyAssets === table && table.sample.src === before}));"""
        result = subprocess.run(["node", "-e", probe, script], capture_output=True, text=True, timeout=5, check=True)
        self.assertEqual(json.loads(result.stdout), {"frozen": True, "nullPrototype": True, "unchanged": True})

    def test_missing_source_is_named(self):
        self.rejected({"sample": "assets/missing.svg"})

    def test_absolute_path_is_rejected(self):
        self.rejected({"sample": str(self.story / "assets" / "sample.svg")})

    def test_parent_path_is_rejected(self):
        self.rejected({"sample": "assets/../assets/sample.svg"})

    def test_remote_path_is_rejected(self):
        self.rejected({"sample": "https://example.invalid/sample.svg"})

    def test_backslash_path_is_rejected(self):
        self.rejected({"sample": "assets\\sample.svg"})

    def test_outside_assets_is_rejected(self):
        (self.story / "sample.svg").write_bytes(SVG)
        self.rejected({"sample": "sample.svg"})

    def test_escaping_symlink_is_rejected(self):
        outside = Path(self.tmp.name) / "outside.svg"
        outside.write_bytes(SVG)
        (self.story / "assets" / "escape.svg").symlink_to(outside)
        self.rejected({"sample": "assets/escape.svg"})

    def test_symlink_loop_is_rejected_and_named(self):
        (self.story / "assets" / "loop.svg").symlink_to("loop.svg")
        self.rejected({"sample": "assets/loop.svg"})

    def test_asset_stream_read_is_bounded(self):
        self.manifest({"sample": "assets/sample.svg"})
        source = (self.story / "assets" / "sample.svg").resolve()
        original_open = Path.open
        sizes = []

        class TrackingStream(io.BytesIO):
            def read(self, size=-1):
                sizes.append(size)
                return super().read(size)

        def open_fixture(path, *args, **kwargs):
            return TrackingStream(SVG) if path == source else original_open(path, *args, **kwargs)

        with patch.object(Path, "open", new=open_fixture):
            self.assertIn("sample", build.load_story_assets(self.story))
        self.assertEqual(sizes, [build.SVG_INPUT_LIMIT + 1])

    def test_bad_manifest_shapes_and_ids_are_rejected(self):
        for value in [None, [], "sample", {"../sample": "assets/sample.svg"}, {"sample": 3}]:
            with self.subTest(value=value):
                self.rejected(value, "assets")

    def test_non_svg_is_rejected(self):
        (self.story / "assets" / "sample.png").write_bytes(b"not an image")
        self.rejected({"sample": "assets/sample.png"})

    def test_malformed_svg_is_rejected(self):
        (self.story / "assets" / "sample.svg").write_bytes(b"<svg")
        self.rejected({"sample": "assets/sample.svg"})

    def test_active_and_external_svg_features_are_rejected(self):
        for fragment in [
            '<script>alert(1)</script>', '<foreignObject/>', '<animate/>',
            '<image href="https://example.invalid/a.svg"/>',
            '<path onload="alert(1)"/>', '<path style="fill:red"/>',
            '<path fill="url(https://example.invalid/a.svg)"/>',
        ]:
            with self.subTest(fragment=fragment):
                value = SVG.replace(b"</svg>", fragment.encode() + b"</svg>")
                (self.story / "assets" / "sample.svg").write_bytes(value)
                self.rejected({"sample": "assets/sample.svg"})

    def test_entities_and_processing_instructions_are_rejected(self):
        for prefix in [b'<!DOCTYPE svg [<!ENTITY x "test">]>', b'<?xml-stylesheet href="https://example.invalid/style"?>']:
            with self.subTest(prefix=prefix):
                (self.story / "assets" / "sample.svg").write_bytes(prefix + SVG)
                self.rejected({"sample": "assets/sample.svg"})

    def test_local_gradients_are_supported(self):
        value = SVG.replace(b"</svg>", b'<defs><linearGradient id="local"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="64" height="80" fill="url(#local)"/></svg>')
        (self.story / "assets" / "sample.svg").write_bytes(value)
        self.manifest({"sample": "assets/sample.svg"})
        self.assertIn("sample", build.load_story_assets(self.story))

    def test_invalid_dimensions_and_parser_limit_are_rejected(self):
        for value in [SVG.replace(b'width="64"', b'width="0"'), SVG.replace(b'height="80"', b'height="80%"'), SVG + b" " * (1024 * 1024)]:
            with self.subTest(size=len(value)):
                (self.story / "assets" / "sample.svg").write_bytes(value)
                self.rejected({"sample": "assets/sample.svg"})

    def test_true_build_injects_before_consumer_and_is_repeatable(self):
        self.manifest({"sample": "assets/sample.svg"})
        (self.story / "src" / "consumer.js").write_text("setup.sample = setup.storyAssets.sample;", encoding="utf-8")
        with patch.object(build, "load_template", return_value="{{STORY_DATA}}"), contextlib.redirect_stdout(io.StringIO()):
            build.build_story(self.story, "a.html")
            build.build_story(self.story, "b.html")
        first = (self.story / "a.html").read_bytes()
        self.assertEqual(first, (self.story / "b.html").read_bytes())
        text = first.decode()
        self.assertLess(text.index("Object.defineProperty(setup, 'storyAssets'"), text.index("setup.sample = setup.storyAssets.sample"))
        self.assertIn("data:image/svg+xml;base64,", text)

    def test_no_assets_build_equals_empty_table_build(self):
        with patch.object(build, "load_template", return_value="{{STORY_DATA}}"), contextlib.redirect_stdout(io.StringIO()):
            build.build_story(self.story, "a.html")
            self.manifest({})
            build.build_story(self.story, "b.html")
        self.assertEqual((self.story / "a.html").read_bytes(), (self.story / "b.html").read_bytes())
        self.assertNotIn(b"setup, 'storyAssets'", (self.story / "a.html").read_bytes())


if __name__ == "__main__":
    unittest.main(verbosity=2)
