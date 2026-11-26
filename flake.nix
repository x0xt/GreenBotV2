{
  description = "GreenBotV2 — Discord bot for The Green Web";

  # The fleet repo (x0xt/fleet) takes this flake as an input and runs the package on bot-01.
  # Build:  nix build .#greenbot      Run:  cd <state dir> && <out>/bin/greenbot
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      lib = pkgs.lib;
      nodejs = pkgs.nodejs_22;

      # @tensorflow/tfjs-node's install script downloads this at `npm install` time; Nix builds have no
      # network, so it's fetched here and dropped where the script looks first (deps/lib), and the
      # script then builds its native binding from source against it.
      libtensorflow = pkgs.fetchurl {
        url = "https://storage.googleapis.com/tensorflow/libtensorflow/libtensorflow-cpu-linux-x86_64-2.9.1.tar.gz";
        hash = "sha256-f1ENJUbj214QsdEZRjaJAD1YeEKJKtPJW8pRz4KCAXM=";
      };

      version = (lib.importJSON ./package.json).version;

      # Split in two so a code change ships a few hundred KB, not ~800 MB:
      #  - greenbot-deps: node_modules only (rebuilt only when package-lock.json changes)
      #  - greenbot: the bot's own files + a symlink to the deps
      greenbot-deps = pkgs.buildNpmPackage {
        pname = "greenbot-deps";
        inherit version nodejs;
        src = lib.fileset.toSource {
          root = ./.;
          fileset = lib.fileset.unions [ ./package.json ./package-lock.json ];
        };
        npmDepsHash = "sha256-t8RESLX0XDbRPAoK6UbWaZSYYq+/cA0pJN1akg7HKWI=";
        dontNpmBuild = true;     # no build step — plain ESM
        npmInstallFlags = [ "--omit=dev" ];

        nativeBuildInputs = [ pkgs.python3 pkgs.autoPatchelfHook ];
        buildInputs = [ pkgs.stdenv.cc.cc.lib ];   # libstdc++ for the prebuilt libtensorflow / sharp libvips

        # The npm hook's own `npm rebuild` would run tfjs-node's install script before we can place
        # libtensorflow, so it skips scripts; they run below, after the library is in deps/lib.
        npmRebuildFlags = [ "--ignore-scripts" ];
        postConfigure = ''
          tfdir=node_modules/@tensorflow/tfjs-node/deps
          mkdir -p $tfdir
          tar xzf ${libtensorflow} -C $tfdir
          npm rebuild --offline
          rm -rf node_modules/@img/*linuxmusl*   # musl builds of sharp; unused on glibc and unpatchable
          rm -rf $tfdir/include                  # C headers, only needed to compile the binding
        '';

        installPhase = ''
          runHook preInstall
          mkdir -p $out && cp -r node_modules $out/
          runHook postInstall
        '';
      };

      greenbot = pkgs.stdenvNoCC.mkDerivation {
        pname = "greenbot";
        inherit version;
        src = lib.fileset.toSource {
          root = ./.;
          fileset = lib.fileset.unions [
            ./package.json ./deploy-commands.js ./src ./filter ./data ./memory ./medias/lobotomy.gif
          ];
        };
        installPhase = ''
          runHook preInstall
          app=$out/lib/greenbot
          mkdir -p $app $out/bin
          cp -r package.json deploy-commands.js src filter $app/
          ln -s ${greenbot-deps}/node_modules $app/node_modules
          mkdir -p $app/seed
          cp -r data $app/seed/data
          cp -r memory $app/seed/memory
          mkdir -p $app/medias && cp medias/lobotomy.gif $app/medias/

          # The bot resolves data/, memory/, logs/ and medias/ against its working directory, so it is
          # run from a writable state dir. This wrapper seeds it on first run, then starts the bot.
          cat > $out/bin/greenbot <<EOF
          #!${pkgs.runtimeShell}
          set -e
          [ -n "\$(ls -A data 2>/dev/null)" ]   || { mkdir -p data;   cp -r --no-preserve=mode $app/seed/data/.   data/; }
          [ -n "\$(ls -A memory 2>/dev/null)" ] || { mkdir -p memory; cp -r --no-preserve=mode $app/seed/memory/. memory/; }
          mkdir -p logs medias/pool
          ln -sfn $app/medias/lobotomy.gif medias/lobotomy.gif
          export NODE_ENV=production
          exec ${nodejs}/bin/node $app/src/index.js
          EOF
          chmod +x $out/bin/greenbot
          runHook postInstall
        '';
        meta.mainProgram = "greenbot";
      };
    in {
      packages.${system} = { inherit greenbot greenbot-deps; default = greenbot; };
    };
}
