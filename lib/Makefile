ifeq ($(shell uname),Darwin)
    EXT := dylib
else
    EXT := a
endif

all: release

winrelease: target/x86_64-pc-windows-gnu/release/zecwalletlite.lib

target/x86_64-pc-windows-gnu/release/zecwalletlite.lib: src/lib.rs Cargo.toml
	cargo build --lib --release --target x86_64-pc-windows-gnu

release: target/release/zecwalletlite.$(EXT)
debug: target/debug/zecwalletlite.$(EXT) 

target/release/zecwalletlite.$(EXT): src/lib.rs Cargo.toml
	cargo build --lib --release

target/debug/zecwalletlite.$(EXT): src/lib.rs Cargo.toml
	cargo build --lib

clean:
	rm -rf target