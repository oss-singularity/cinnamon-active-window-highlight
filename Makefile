.PHONY: check social-preview check-social-preview

check:
	cjs tests/check-source.js extension.js
	python3 -m json.tool metadata.json >/dev/null
	python3 -m json.tool settings-schema.json >/dev/null
	shellcheck install.sh uninstall.sh
	$(MAKE) check-social-preview

social-preview:
	python3 .github/social-preview-src/render-all.py

check-social-preview:
	python3 .github/social-preview-src/render-all.py --check
