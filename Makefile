.PHONY: build install

build:
	pnpm build

install: build
	pi install /Users/alastair/work/manifest-workspace/manifest-pi
