FROM rust:1.97.1-bookworm@sha256:77fac8b98f9f46062bb680b6d25d5bcaabfc400143952ebc572e924bcbedc3fa AS build
WORKDIR /build
COPY --parents Cargo.toml Cargo.lock rust-toolchain.toml build.rs db src ./
RUN cargo build --locked --release

FROM gcr.io/distroless/cc-debian12:nonroot@sha256:adcd20c7b4c988b73cbfbddb26d2eee574571e6d7c9ffea29b3821e0690efb77
COPY --from=build /build/target/release/auth-server /usr/local/bin/auth-server
ENTRYPOINT ["/usr/local/bin/auth-server"]
