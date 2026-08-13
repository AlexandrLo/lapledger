# Working in this repository

## Stay inside this directory

Everything you may read, run or change lives under this repository. Never read
files from, run commands in, or write to another project on this machine — the
sibling directories under `~/Projects` belong to unrelated work.

This matters most when you need to inspect an installed dependency. There is no
host `node_modules` here; it lives in a Docker volume, reachable only from
inside the container:

    docker compose run --rm app cat node_modules/<package>/package.json
    docker compose run --rm app node -e "console.log(Object.keys(require('<package>')))"

Borrowing a copy of a package from another project on this machine proves
nothing about this one — the installed versions differ, and the answer you get
is about the wrong tree.
