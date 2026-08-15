# Every target runs the toolchain inside the container defined by Dockerfile
# and compose.yaml. Nothing here invokes node, pnpm or vite on the host.

COMPOSE := docker compose
RUN     := $(COMPOSE) run --rm app

.DEFAULT_GOAL := help

.PHONY: help install hooks dev down test test-watch lint lint-fix format format-check build check shell image clean clean-all

help: ## List the available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN { FS = ":.*?## " } { printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2 }'

install: hooks ## Install dependencies (required on a fresh clone and after pnpm-lock.yaml changes)
	$(RUN) pnpm install

hooks: ## Setup githooks
	git config core.hooksPath .githooks

dev: ## Start dev server
	$(COMPOSE) up

down: ## Stop the dev server and remove its container
	$(COMPOSE) down

test: ## Run the test suite once
	$(RUN) pnpm test

test-watch: ## Run the test suite in watch mode
	$(RUN) pnpm test:watch

lint-check: ## Report lint violations
	$(RUN) pnpm lint:check

lint-fix: ## Fix the lint violations that are fixable
	$(RUN) pnpm lint:fix

types-check: ## Run typechecking only
	$(RUN) pnpm types:check

build: ## Type-check and produce a production build in dist/
	$(RUN) pnpm build

check: lint-check types-check ## Everything a commit has to pass

shell: ## Open a shell in the container
	$(RUN) sh

image: ## Rebuild the container image
	$(COMPOSE) build

clean: ## Delete build output
	rm -rf dist

clean-all: clean ## Delete build output, installed packages and the container's volumes
	rm -rf node_modules .pnpm-store
	$(COMPOSE) down --volumes
