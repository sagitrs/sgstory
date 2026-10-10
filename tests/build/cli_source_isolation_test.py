"""CLI/web build boundary tests: production builder, copied source, temporary artifacts.

This is build/component testing, not CLI gameplay. No production source or shared
build/dist is changed. --selftest mutates only a disposable copied builder.
"""
import contextlib
import importlib.util
import io
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build.py"
TEMP_ROOT = Path(os.environ.get("TMPDIR") or str(Path.home() / "tmp"))


def load_builder():
    spec = importlib.util.spec_from_file_location("cli_boundary_build", BUILD)
    module = importlib.util.module_from_spec(spec)
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
    return module


class CliBoundaryResult(unittest.TextTestResult):
    apparatus_error = False

    def addError(self, test, error):
        if isinstance(error[1], (OSError, SyntaxError, subprocess.TimeoutExpired)):
            self.apparatus_error = True
        super().addError(test, error)


class CliBoundaryRunner(unittest.TextTestRunner):
    resultclass = CliBoundaryResult


class CliSourceIsolationTest(unittest.TestCase):
    def setUp(self):
        TEMP_ROOT.mkdir(parents=True, exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(prefix="sgstory-cli-boundary-", dir=TEMP_ROOT)
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.src = self.root / "src"
        shutil.copytree(ROOT / "src", self.src)
        self.build = load_builder()
        for key, value in {
            "ROOT": self.root, "PLUGIN_SRC": self.src,
            "HOST_DIR": self.src / "host", "UNIT_DIR": self.root / "tests" / "unit",
            "UNIT_DIST": self.root / "tests" / "unit" / "dist",
        }.items():
            setattr(self.build, key, value)
        self.story = self.root / "story"
        (self.story / "src").mkdir(parents=True)
        (self.story / "src" / "start.twee").write_text(":: 开始\n旧网页故事。\n", encoding="utf-8")
        # Same basename and a 'client' prefix must stay included outside src/cli/.
        self.write("core/boundary-probe.js", "const ordinaryCoreProbe = true;")
        self.write("client/boundary-probe.js", "const ordinaryClientProbe = true;")

    def write(self, relative, text):
        target = self.src / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text + "\n", encoding="utf-8")

    def add_cli(self):
        for relative in ["cli/boundary-probe.js", "cli/deep/child.js", "cli/00-init.js",
                         "cli/nested/dnd3/00-init.js", "cli/nested/cli-only-pack/00-init.js"]:
            self.write(relative, "const CLI_MUST_NOT_ENTER_WEB_ARTIFACT = true;")

    def paths(self, hosts=None, packs=None):
        return [name for name, _, _ in self.build.collect_js_files(hosts, packs)]

    def assert_same_collection(self, hosts=None, packs=None):
        before = self.paths(hosts, packs)
        self.assertTrue(before, "precondition: real web source must be collected")
        self.add_cli()
        self.assertEqual(self.paths(hosts, packs), before, "src/cli must not alter the ordered web collection")
        self.assertIn("src/core/boundary-probe.js", before)
        self.assertIn("src/client/boundary-probe.js", before)

    def test_default_collection_excludes_cli_but_keeps_lookalikes(self):
        self.assert_same_collection()

    def test_legacy_core_rule_host_and_same_named_scripts_are_still_collected(self):
        self.add_cli()
        actual = self.paths()
        for name in ["src/core/00-namespace.js", "src/dnd/dnd3/00-init.js",
                     "src/host/sugarcube/00-init.js", "src/core/boundary-probe.js",
                     "src/client/boundary-probe.js"]:
            with self.subTest(legacy_source=name):
                self.assertIn(name, actual, f"legacy web source must still be collected: {name}")

    def test_explicit_sugarcube_collection_is_unchanged(self):
        self.assert_same_collection(["sugarcube"])

    def test_explicit_headless_collection_is_unchanged(self):
        self.assert_same_collection(["headless"])

    def test_all_hosts_collection_is_unchanged(self):
        self.assert_same_collection(self.build.host_dirs())

    def test_selected_rule_pack_collection_is_unchanged(self):
        self.assert_same_collection(["headless"], ["dnd3"])

    def test_rule_discovery_excludes_cli_initializers(self):
        before = self.build.可用规则包()
        self.assertIn("dnd3", before)
        self.add_cli()
        self.assertEqual(self.build.可用规则包(), before, "CLI init files must not become web rule packages")

    def test_cli_only_pack_is_named_and_rejected(self):
        self.add_cli()
        with self.assertRaisesRegex(SystemExit, "未知规则包 cli-only-pack"):
            self.build.build_story(self.story, packs=["cli-only-pack"])

    def test_unknown_host_still_has_named_failure(self):
        self.add_cli()
        with self.assertRaisesRegex(SystemExit, "未知宿主：cli"):
            self.build.resolve_hosts("cli")

    def product(self, mode):
        hosts, explicit = self.build.resolve_hosts(mode)
        with contextlib.redirect_stdout(io.StringIO()):
            self.build.build_unit_bundle(hosts, explicit)
            self.build.build_story(self.story, hosts=hosts, explicit=explicit)
        return ((self.build.UNIT_DIST / "bundle.js").read_bytes(),
                (self.build.UNIT_DIST / "manifest.js").read_bytes(),
                (self.story / "game.html").read_bytes())

    def test_real_story_and_unit_artifacts_are_byte_identical_with_cli_present(self):
        modes = [None, "sugarcube", "headless", "all"]
        before = {mode: self.product(mode) for mode in modes}
        self.add_cli()
        for mode in modes:
            with self.subTest(host=mode):
                result = self.product(mode)
                self.assertEqual(result, before[mode], "CLI files must not change HTML, bundle or manifest bytes")
                self.assertNotIn(b"CLI_MUST_NOT_ENTER_WEB_ARTIFACT", result[0] + result[2])

    def test_story_local_cli_named_directory_is_not_excluded(self):
        local = self.story / "src" / "cli" / "story-content.js"
        local.parent.mkdir()
        local.write_text("setup.STORY_LOCAL_CLI_NAME_STAYS = true;\n", encoding="utf-8")
        self.add_cli()
        with contextlib.redirect_stdout(io.StringIO()):
            self.build.build_story(self.story)
        self.assertIn(b"setup.STORY_LOCAL_CLI_NAME_STAYS", (self.story / "game.html").read_bytes())


def compare_base(base):
    """Manual fixed-source comparison; no checkout, shared outputs or floating ref."""
    if not re.fullmatch(r"[0-9a-fA-F]{40}", base):
        print("CLI legacy comparison apparatus error: --compare-base needs a full commit SHA", file=sys.stderr)
        return 2
    resolved = subprocess.run(["git", "rev-parse", "--verify", base + "^{commit}"],
                              cwd=ROOT, capture_output=True, text=True, timeout=20)
    if resolved.returncode or resolved.stdout.strip().lower() != base.lower():
        print(f"CLI legacy comparison apparatus error: commit unavailable: {base}; "
              f"{resolved.stderr.strip()}", file=sys.stderr)
        return 2
    record = {"base": base, "builderSha256": hashlib.sha256(BUILD.read_bytes()).hexdigest(),
              "python": sys.version, "cases": [], "passed": 0, "productFailures": 0,
              "environmentInvalid": 0, "uncovered": 0, "planned": 4}
    TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="sgstory-cli-legacy-", dir=TEMP_ROOT) as temporary:
        root = Path(temporary)
        archive = root / "baseline.tar"
        with archive.open("wb") as output:
            subprocess.run(["git", "archive", base], cwd=ROOT, stdout=output,
                           stderr=subprocess.PIPE, check=True, timeout=20)
        for variant in ["old", "new"]:
            target = root / variant
            target.mkdir()
            with tarfile.open(archive) as source:
                source.extractall(target, filter="data")
        (root / "new" / "build.py").write_bytes(BUILD.read_bytes())
        for name in ["probe.js", "nested/deep/probe.js", "00-init.js",
                     "nested/cli-only-pack/00-init.js"]:
            target = root / "new" / "src" / "cli" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("const CLI_PROBE_MUST_NOT_ENTER_WEB = true;\n", encoding="utf-8")
        for host in [None, "sugarcube", "headless", "all"]:
            case = {"host": host or "default", "products": {}}
            try:
                products = {}
                for variant in ["old", "new"]:
                    target = root / variant
                    args = [sys.executable, "build.py"] + (["--host", host] if host else [])
                    result = subprocess.run(args, cwd=target, capture_output=True, text=True,
                                            timeout=20, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
                    if result.returncode:
                        raise RuntimeError(f"{variant} builder cannot run: rc={result.returncode}; "
                                           f"{result.stdout}\n{result.stderr}")
                    products[variant] = {}
                    for name, path in [("html", "tests/e2e/old-house/game.html"),
                                       ("bundle", "tests/unit/dist/bundle.js"),
                                       ("manifest", "tests/unit/dist/manifest.js")]:
                        data = (target / path).read_bytes()
                        if not data:
                            raise RuntimeError(f"{variant}: empty product: {path}")
                        products[variant][name] = data
                        case["products"].setdefault(name, {})[variant] = {
                            "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
                case["equal"] = products["old"] == products["new"]
                record["passed" if case["equal"] else "productFailures"] += 1
            except (OSError, subprocess.SubprocessError, RuntimeError) as error:
                case["apparatusError"] = str(error)
                record["environmentInvalid"] += 1
            record["cases"].append(case)
    print(json.dumps(record, ensure_ascii=False, indent=2))
    print(f"CLI fixed legacy comparison: {record['passed']} passed / "
          f"{record['productFailures']} product failure / {record['environmentInvalid']} environment invalid / "
          f"{record['uncovered']} uncovered; planned={record['planned']}")
    return 2 if record["environmentInvalid"] else (1 if record["productFailures"] else 0)


def selftest():
    """The single registered knife removes both boundaries through their predicate."""
    raw = BUILD.read_bytes()
    anchor = b'return file_path.is_relative_to(PLUGIN_SRC / "cli")'
    if raw.count(anchor) != 1:
        print("CLI isolation knife: apparatus error: expected one predicate anchor", file=sys.stderr)
        return 2
    TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="sgstory-cli-knife-", dir=TEMP_ROOT) as temporary:
        root = Path(temporary)
        (root / "tests" / "build").mkdir(parents=True)
        shutil.copytree(ROOT / "src", root / "src")
        shutil.copytree(ROOT / "vendor", root / "vendor")
        target = root / "build.py"
        target.write_bytes(raw)
        script = root / "tests" / "build" / Path(__file__).name
        shutil.copyfile(__file__, script)
        def run():
            return subprocess.run([sys.executable, str(script)], capture_output=True, text=True,
                                  timeout=20, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        baseline = run()
        target.write_bytes(raw.replace(anchor, b"return False", 1))
        mutant = run()
        target.write_bytes(raw)
        restored = run()
        collection_red = "FAIL: test_default_collection_excludes_cli_but_keeps_lookalikes" in mutant.stderr
        discovery_red = "FAIL: test_rule_discovery_excludes_cli_initializers" in mutant.stderr
        byte_restore = target.read_bytes() == raw
        # Guard against missing tools and a child that exits 0 without running tests.
        gate = root / "tests" / "gates" / "pack-selection.mjs"
        gate.parent.mkdir()
        shutil.copyfile(ROOT / "tests" / "gates" / "pack-selection.mjs", gate)
        shutil.copyfile(ROOT / "tests" / "build" / "story_assets_test.py",
                        root / "tests" / "build" / "story_assets_test.py")
        shutil.copytree(ROOT / "tests" / "e2e" / "old-house", root / "tests" / "e2e" / "old-house")
        controls = []
        try:
            for name in ["missing_cli_test", "zero_execution"]:
                if name == "missing_cli_test":
                    script.unlink()
                else:
                    script.write_text("print('no tests were run')\n", encoding="utf-8")
                result = subprocess.run(["node", str(gate)], cwd=root, capture_output=True, text=True,
                                        timeout=20, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
                legacy_red = re.search(r"^\s+· [①②③④⑤⑥⑦]", result.stdout, re.MULTILINE)
                named = "⑧装置错" in result.stdout
                hit = result.returncode == 2 and named and not legacy_red
                controls.append(hit)
                print(f"CLI apparatus control {name}: rc={result.returncode} expected=2 "
                      f"named={named} legacy_red={bool(legacy_red)}")
                if not hit:
                    print(result.stdout + result.stderr, file=sys.stderr)
        finally:
            shutil.copyfile(__file__, script)
        io_control = """import runpy,sys,unittest
class MissingProduct(unittest.TestCase):
    def test_missing_product(self):
        raise FileNotFoundError('injected missing temporary build artifact')
script=sys.argv[1]
sys.argv=[script]
runpy.run_path(script,run_name='__main__',init_globals={'MissingProduct':MissingProduct})
"""
        io_result = subprocess.run([sys.executable, "-c", io_control, str(script)], cwd=root,
                                   capture_output=True, text=True, timeout=20,
                                   env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        io_named = "CLI boundary apparatus error" in io_result.stderr and "test_missing_product" in io_result.stderr
        io_hit = io_result.returncode == 2 and io_named
        controls.append(io_hit)
        print(f"CLI apparatus control missing_product: rc={io_result.returncode} expected=2 named={io_named}")
        if not io_hit:
            print(io_result.stdout + io_result.stderr, file=sys.stderr)
        print(f"CLI isolation knife: baseline_rc={baseline.returncode} mutant_rc={mutant.returncode} "
              f"restored_rc={restored.returncode} byte_restore={byte_restore} "
              f"collection_red={collection_red} discovery_red={discovery_red}")
        passed = (baseline.returncode == 0 and mutant.returncode == 1 and restored.returncode == 0
                  and byte_restore and collection_red and discovery_red and all(controls))
        if not passed:
            for name, result in [("baseline", baseline), ("mutant", mutant), ("restored", restored)]:
                print(f"{name}:\n{result.stdout}\n{result.stderr}", file=sys.stderr)
        return 0 if passed else 1


if __name__ == "__main__":
    if (not BUILD.is_file() or not (ROOT / "vendor" / "format.js").is_file()
            or not all((ROOT / "src" / p).is_dir() for p in ["core", "dnd", "host"])):
        print("CLI boundary apparatus error: missing builder/web source/template; "
              "restore the checkout, then run python3 build.py", file=sys.stderr)
        sys.exit(2)
    try:
        load_builder().load_template()
    except (Exception, SystemExit) as error:
        print(f"CLI boundary apparatus error: production builder cannot start: {error}; "
              "restore the checkout, then run python3 build.py", file=sys.stderr)
        sys.exit(2)
    if len(sys.argv) == 3 and sys.argv[1] == "--compare-base":
        try:
            sys.exit(compare_base(sys.argv[2]))
        except (OSError, subprocess.SubprocessError, tarfile.TarError) as error:
            print(f"CLI legacy comparison apparatus error: {error}", file=sys.stderr)
            sys.exit(2)
    elif sys.argv[1:] == ["--selftest"]:
        try:
            sys.exit(selftest())
        except (OSError, subprocess.TimeoutExpired) as error:
            print(f"CLI isolation knife apparatus error: {error}", file=sys.stderr)
            sys.exit(2)
    elif "--selftest" in sys.argv:
        print("CLI boundary apparatus error: --selftest takes no additional arguments", file=sys.stderr)
        sys.exit(2)
    else:
        program = unittest.main(verbosity=2, testRunner=CliBoundaryRunner, exit=False)
        if program.result.apparatus_error:
            print("CLI boundary apparatus error: I/O, syntax or timeout during fixture/build execution; "
                  "see the named ERROR above", file=sys.stderr)
            sys.exit(2)
        sys.exit(0 if program.result.wasSuccessful() else 1)
