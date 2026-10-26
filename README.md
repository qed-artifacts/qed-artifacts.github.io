# QED Artifacts public site

This repository is the canonical public website and lightweight-app host for
[qedartifacts.org](https://qedartifacts.org/). It contains only material that is
appropriate for unrestricted public access.

The canonical repository is owned by the `qed-artifacts` organization at
<https://github.com/qed-artifacts/qed-artifacts.github.io>. Contributors use
their individual GitHub identities; no personal account owns the site repository.

## Repository boundaries

- **This repository:** the public organizational website, open documentation,
  the serial Dictionary of Quality under `dictionary/`, and lightweight
  browser-only applications under `apps/`.
- **QED-AI Operations Hub:** a separate private/local repository for governance
  records, meeting data, signatures, source intake, and internal operations.
- **Signing portal:** a separate restricted application because it accepts
  attributed signatures and writes durable records.

Never copy private records, residential addresses, credentials, signatures,
meeting recordings, unredacted filings, internal source corpora, or personal
data into this repository or its build output.

Dictionary pages are generated from exact authorized release manifests in the
private `qed-artifacts/dictionary-of-quality` publication store. Only the
public HTML is copied here. Original dictionary prose and constructed examples
are offered under CC0 1.0; cited third-party works retain their own rights.

## Public-app structure

Each lightweight app lives at `apps/<app-slug>/` and is listed in
`apps/catalog.json`. Shared public assets belong under `apps/shared/`; an app
must not reach into the private Operations Hub or signing portal.

See [`apps/README.md`](apps/README.md) for the placement decision and release
checklist.

## Publishing model

GitHub Pages publishes the static site from this repository. Apps hosted here
must work as HTML, CSS, JavaScript, and public static assets. A tool that needs
server-side processing, authentication, confidential inputs, durable writes,
or an independent compliance boundary belongs in a separate repository and
hosted service, with a catalog link from this site.

## Released glossary page

`dictionary/glossary/index.html` is generated from the public
`qed-artifacts/dictionary-of-quality-content` catalog and exact, versioned
objects. The private Dictionary store remains the editorial authority; only
its approved, tagged GitHub releases enter this page. The page contains no
private source records and is not an editable glossary store.

After a new glossary publication is verified and its public commit tagged,
check out that exact public content tag and run:

```text
node scripts/build-glossary-page.mjs --source PATH_TO_PUBLIC_CONTENT_CHECKOUT --tag GLOSSARY_TAG
node scripts/build-glossary-page.mjs --source PATH_TO_PUBLIC_CONTENT_CHECKOUT --tag GLOSSARY_TAG --check
```

The compiler runs the public repository validator, confirms that the tag
points at the checked-out commit, and creates the page from `catalog.json` and
its referenced public JSON objects. Propose the generated change through a
reviewed site pull request. Do not import unpublished objects or copy text
from the private collection into this repository.

When the tagged public content includes `relations/graph.v1.json`, the same
compiler adds a cluster map, relation-type and term filters, and an accessible
relation list above glossary search. All node labels, links, relation counts,
and cluster membership come from that validated snapshot and the same catalog.
Aliases remain a distinct navigation route. The graph may show isolated cluster
members; it never infers missing edges. `node scripts/test-glossary-relations-page.mjs`
builds a local eight-term synthetic fixture under `out/glossary-relations-fixture/`
for UI checks; it is not public dictionary content. The `--output SITE_FILE`
builder option permits a local preview without changing the canonical page.

The glossary compiler, search script, and page styling are offered under
Apache-2.0 in `LICENSE-CODE`. Released glossary prose follows each public
object's CC0-1.0 declaration.
