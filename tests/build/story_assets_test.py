"""Production build.py asset tests; temporary stories, no shared build/dist writes."""
import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
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

    def test_css_escaped_url_attributes_are_rejected(self):
        for value in [r'u\72l(https://example.invalid/a.svg)', r'\75rl(https://example.invalid/a.svg)', '&#92;75rl(https://example.invalid/a.svg)']:
            with self.subTest(value=value):
                fragment = f'<path fill="{value}"/>'
                (self.story / "assets" / "sample.svg").write_bytes(SVG.replace(b"</svg>", fragment.encode() + b"</svg>"))
                self.rejected({"sample": "assets/sample.svg"}, "CSS 转义")

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
        # 块序（`sgstory#2028` E5 契约面之一）：**多脚本臂** —— 单脚本只能证「在它之前」，
        # 中段注入（例如藏在两个故事脚本之间）看不出来 ⇒ 再加一份按路径排序在后的脚本。
        (self.story / "src" / "zzz-later.js").write_text("setup.later = setup.storyAssets?.sample;", encoding="utf-8")
        with patch.object(build, "load_template", return_value="{{STORY_DATA}}"), contextlib.redirect_stdout(io.StringIO()):
            build.build_story(self.story, "a.html")
            build.build_story(self.story, "b.html")
        first = (self.story / "a.html").read_bytes()
        self.assertEqual(first, (self.story / "b.html").read_bytes())
        text = first.decode()
        at_assets = text.index("Object.defineProperty(setup, 'storyAssets'")
        for marker in ["setup.sample = setup.storyAssets.sample", "setup.later = setup.storyAssets?.sample"]:
            self.assertLess(at_assets, text.index(marker), f"资产段须在该故事脚本之前：{marker}")
        self.assertIn("data:image/svg+xml;base64,", text)

    def _product(self, out="a.html"):
        """真 `build_story` 的产物文本（模板用替身 ⇒ 只留脚本与段落，✗ 不碰共享 build/dist）。"""
        with patch.object(build, "load_template", return_value="{{STORY_DATA}}"), contextlib.redirect_stdout(io.StringIO()):
            build.build_story(self.story, out)
        return (self.story / out).read_text(encoding="utf-8")

    def _asset_block(self, text):
        """产物里的**资产注入段**（自段头到该 IIFE 的结尾）。"""
        start = text.index("story assets: offline static SVG")
        return text[start:text.index("})();", start)]

    def test_product_asset_block_carries_no_remote_reference(self):
        """产物级（`sgstory#2028` E5 契约面之二）：资产段只准做内嵌，**✗ 不得出现任何远程引用**。

        与函数级的拒绝臂（`test_active_and_external_svg_features_are_rejected` 等）**不同面**：
        那些断言「源被拒」，这条断言「**产物里没有**」—— 注入环节若引入网络面，只有产物级看得出来。
        ⚠ 判据为何不会误报：`:` 与 `/` 都**不在** base64 字母表内 ⇒ 内嵌的大段字节里
        **不可能**拼出 `http://` 或 `https://`（连 `http:` 也拼不出）。"""
        self.manifest({"sample": "assets/sample.svg"})
        block = self._asset_block(self._product())
        self.assertEqual(re.findall(r"https?://", block), [], "资产段内不得出现远程引用")
        descriptors = json.loads(re.search(r"Object\.entries\((\{.*?\})\)", block, re.S).group(1))
        for asset_id, descriptor in descriptors.items():
            self.assertTrue(descriptor["src"].startswith("data:image/svg+xml;base64,"),
                            f"{asset_id}：src 只允许内嵌 data URL")
            self.assertEqual(descriptor["mime"], "image/svg+xml")

    def test_product_inlined_bytes_match_source_and_hash(self):
        """产物级（`sgstory#2028` E5 契约面之三）：从**产物**解出的字节须与源文件**逐字节相同**，
        且描述子里的 `sha256` 须是这些字节的哈希。

        这条与 `test_descriptor_contains_exact_bytes_dimensions_and_hash` 的差别是**从哪读**：
        那条读的是 `load_story_assets()` 的返回值（函数出口），这条读的是**成品 HTML** 里的内嵌字节
        —— 注入／拼接环节若重编码或改写字节，只有这一条看得出来。"""
        self.manifest({"sample": "assets/sample.svg"})
        block = self._asset_block(self._product())
        descriptors = json.loads(re.search(r"Object\.entries\((\{.*?\})\)", block, re.S).group(1))
        raw = (self.story / "assets" / "sample.svg").read_bytes()
        self.assertTrue(descriptors, "夹具应至少声明一份素材")
        for asset_id, descriptor in descriptors.items():
            inlined = base64.b64decode(descriptor["src"].split(",", 1)[1])
            self.assertEqual(inlined, raw, f"{asset_id}：产物内嵌字节须与源文件逐字节相同")
            self.assertEqual(descriptor["sha256"], hashlib.sha256(inlined).hexdigest(),
                             f"{asset_id}：描述子里的 sha256 须是内嵌字节的哈希")

    def test_no_assets_build_equals_empty_table_build(self):
        with patch.object(build, "load_template", return_value="{{STORY_DATA}}"), contextlib.redirect_stdout(io.StringIO()):
            build.build_story(self.story, "a.html")
            self.manifest({})
            build.build_story(self.story, "b.html")
        self.assertEqual((self.story / "a.html").read_bytes(), (self.story / "b.html").read_bytes())
        self.assertNotIn(b"setup, 'storyAssets'", (self.story / "a.html").read_bytes())


if __name__ == "__main__":
    unittest.main(verbosity=2)
