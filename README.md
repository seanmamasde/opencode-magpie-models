# opencode-magpie-models

[OpenCode](https://opencode.ai) V2 plugin for a [Magpie](https://usemagpie.ai) gateway: registers a
provider whose models come from Magpie's `/v1/models`, so no model list has to be written into
`opencode.jsonc` or kept up to date by hand.

Each model gets Magpie's label, context and output limits, input types (text, image, pdf, …) and
reasoning levels (low … max, as OpenCode variants). The list is read when OpenCode starts and again
every hour. If Magpie can't be reached, the last list saved in
`$XDG_CACHE_HOME/opencode-magpie-models/<id>.json` is used.

## Use

In `opencode.jsonc` (remove any hand-written provider with the same id):

```jsonc
{
  "plugins": [
    {
      "package": "opencode-magpie-models",
      "options": {
        "baseURL": "https://magpie.example.com/v1",
        "keyFile": "~/.secrets/magpie-key", // file holding a Magpie gateway key
        // optional: "id" (default "magpie"), "name" (default "Magpie"), "refreshMinutes" (default 60)
      },
    },
  ],
}
```

Then restart OpenCode's background service (`opencode service restart`). Models appear as
`magpie/<provider>/<model>`, e.g. `magpie/claude/claude-sonnet-5-5#high`.

From a local checkout, use the folder's absolute path as `package`. OpenCode loads the folder's root
`index.ts`.

Tested with OpenCode 2.1.2.

## Develop

```sh
npm install
bun test
```

## License

MIT
