.PHONY: check

check:
	cjs tests/check-source.js extension.js
	python3 -m json.tool metadata.json >/dev/null
	python3 -m json.tool settings-schema.json >/dev/null
	shellcheck install.sh uninstall.sh
