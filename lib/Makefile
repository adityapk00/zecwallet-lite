ifeq ($(shell uname),Darwin)
    EXT := dylib
else
    EXT := a
endif

all: release

winrelease: target/x86_64-pc-windows-gnu/release/silentdragonlite.lib

target/x86_64-pc-windows-gnu/release/silentdragonlite.lib: src/lib.rs Cargo.toml
	cargo build --lib --release --target x86_64-pc-windows-gnu

release: target/release/silentdragonlite.$(EXT)
debug: target/debug/silentdragonlite.$(EXT) 

target/release/silentdragonlite.$(EXT): src/lib.rs Cargo.toml
	cargo build --lib --release

target/debug/silentdragonlite.$(EXT): src/lib.rs Cargo.toml
	cargo build --lib

clean:
	rm -rf target