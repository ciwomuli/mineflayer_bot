# 中间页：上一页和下一页均可用
$tellraw $(target) ["",{"text":"[上一页]","color":"aqua","clickEvent":{"action":"suggest_command","value":"/tell $(botName) !litematica list $(previousPage)"}},{"text":"  第 $(page)/$(pageCount) 页  ","color":"gold"},{"text":"[下一页]","color":"aqua","clickEvent":{"action":"suggest_command","value":"/tell $(botName) !litematica list $(nextPage)"}}]
