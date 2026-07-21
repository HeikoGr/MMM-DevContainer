# Troubleshooting

## Common Issues

### VS Code tasks fail on the host

Make sure Docker is running and the `magicmirror-dev` container is already started.

### Module dependencies are missing in the container

Check whether the module has a `package.json` and whether the container image includes the build tools that module needs.

### Container name changed

If you renamed the compose container, update the local tasks or helper scripts that still refer to `magicmirror-dev`.

### MagicMirror file layout differences

Recent MagicMirror versions changed some default paths such as `custom.css` and the default modules directory. This repository already bakes `config.js`, `custom.css`, and checked-in `modules/` content into the image to account for that.