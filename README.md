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
