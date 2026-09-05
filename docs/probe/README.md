# Avatar embedding probe

Does GitHub render an `<image>` with a `data:` URI inside a committed SVG?

The answer decides whether the **committed** card can carry a face at all. The
server-rendered card (`/api/card/<handle>.svg`) is served by us and can do as it likes; the
committed one is a file in someone's repository, and GitHub sanitises SVGs it serves.

An external `href` is not an option either way — the card's whole premise is that it is a file
rather than a URL, and a card that only renders while a third party is up is the thing this
project exists not to be.

## Read it two ways, because they are not the same test

**Raw file** — GitHub's own SVG viewer:

<https://github.com/iyashjayesh/tokenchit/blob/feat/ledger/docs/probe/avatar-probe.svg>

**Embedded in Markdown** — which goes through the camo image proxy, the path a real card takes
when someone puts it in their README:

![probe](../probe/avatar-probe.svg)

If two faces appear in both, embedding works and the committed card can have one. If the blob
view renders and the Markdown embed does not, only the server-rendered card can. If neither
does, the idea is dead and the card stays text.

Both spellings are in the file: `href` and `xlink:href`. Sanitisers have historically treated
them differently, and a probe that tests one would answer half the question.
