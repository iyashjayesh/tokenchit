# For Glama's listing check, which starts the server and confirms it answers an
# introspection request (initialize, then tools/list).
#
# Installs the published package rather than building from this repo: it is what a user
# actually runs, so a green check here means the thing on npm works rather than the thing in
# this tree. Override the version at build time with --build-arg VERSION=x.y.z.
#
# There are no agent logs inside a container, so the usage tools answer zero. That is the
# correct answer to "what is on this machine" when the machine is empty, and introspection —
# which is what the check exercises — does not read the disk at all.
FROM node:22-alpine

ARG VERSION=latest
RUN npm install -g "@tokenchit/mcp@${VERSION}"

# stdio transport: the protocol runs over stdin/stdout, so nothing is exposed and nothing is
# served. A container that published a port would be advertising a surface this has not got.
ENTRYPOINT ["tokenchit-mcp"]
