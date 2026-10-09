# Dispatches are A5 PDFs, not ePubs

A Dispatch is rendered as a fixed-layout A5 PDF rather than an ePub. On the reMarkable, ePubs reflow, so handwritten marks are tied to reflowed pages and are hard to map back to the source text. Fixed-layout PDF keeps every mark at a stable position on the page, which annotation sync will depend on. A5 is used because its height matches the rM2 screen, so pages display at roughly true size.

## Considered Options

- **ePub**: you can change the font size on the device, but annotations can't be reliably mapped back to the text.
- **A4 PDF**: shrunk to about 71% on the screen, which makes body text uncomfortably small.
- **Custom 158×210 mm PDF**: fills the screen exactly, but is a non-standard paper size that prints badly. A5 is close enough.
