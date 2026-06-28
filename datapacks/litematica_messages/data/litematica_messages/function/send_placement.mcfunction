# 参数：target、botName、index、name
$tellraw $(target) ["",{"text":"#$(index) $(name) ","color":"white"},{"text":"[备货]","color":"green","clickEvent":{"action":"suggest_command","value":"/tell $(botName) !litematica stock $(index) "}},{"text":" "},{"text":"[检查]","color":"aqua","clickEvent":{"action":"suggest_command","value":"/tell $(botName) !litematica check $(index)"}}]
