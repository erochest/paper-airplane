-- Pandoc filter for Conversation Dispatches: wraps each `prompt` div in the Dispatch template's
-- `#prompt[…]` function, so the template decides how prompts are set apart from Replies.
function Div(div)
  if not div.classes:includes("prompt") then return nil end
  local blocks = pandoc.Blocks({ pandoc.RawBlock("typst", "#prompt[") })
  blocks:extend(div.content)
  blocks:insert(pandoc.RawBlock("typst", "]"))
  return blocks
end
