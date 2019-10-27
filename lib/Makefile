ifeq ($(shell uname),Darwin)
    EXT := dylib
	CFLAGS := "-mmacosx-version-min=10.11"
else
    EXT := a
	CFLAGS := ""
endif

PWD := $(shell pwd)

all: release

winrelease: target/x86_64-pc-windows-gnu/release/zecwalletlite.lib

target/x86_64-pc-windows-gnu/release/zecwalletlite.lib: src/lib.rs Cargo.toml
	SODIUM_LIB_DIR="$(PWD)/libsodium-mingw/" cargo build --lib --release --target x86_64-pc-windows-gnu

release: target/release/zecwalletlite.$(EXT)
debug: target/debug/zecwalletlite.$(EXT) 

target/release/zecwalletlite.$(EXT): src/lib.rs Cargo.toml
	LIBS="" CFLAGS=$(CFLAGS) cargo build --lib --release

target/debug/zecwalletlite.$(EXT): src/lib.rs Cargo.toml
	LIBS="" CFLAGS=$(CFLAGS) cargo build --lib

clean:
	rm -rf target