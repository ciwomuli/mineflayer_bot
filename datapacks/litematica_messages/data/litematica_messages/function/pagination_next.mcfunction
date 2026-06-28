# 首页：只有下一页可用
$tellraw $(target) ["",{"text":"[上一页]","color":"dark_gray"},{"text":"  第 $(page)/$(pageCount) 页  ","color":"gold"},{"text":"[下一页]","color":"aqua","clickEvent":{"action":"suggest_command","value":"/tell $(botName) !litematica list $(nextPage)"}}]
