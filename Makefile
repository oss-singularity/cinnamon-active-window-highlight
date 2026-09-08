.PHONY: check package check-package social-preview check-social-preview install uninstall

check:
	cjs tests/check-source.js extension.js
	python3 -m json.tool metadata.json >/dev/null
	python3 -m json.tool settings-schema.json >/dev/null
	python3 -m json.tool packaging/files.json >/dev/null
	python3 scripts/package.py --check
	python3 -c 'import ast, pathlib; ast.parse(pathlib.Path("FrameRadiusWidget.py").read_text())'
	shellcheck install.sh uninstall.sh
	$(MAKE) check-social-preview

package:
	python3 scripts/package.py

check-package:
	python3 scripts/package.py --check

social-preview:
	python3 .github/social-preview-src/render-all.py

check-social-preview:
	python3 .github/social-preview-src/render-all.py --check
