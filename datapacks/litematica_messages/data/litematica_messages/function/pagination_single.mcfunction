# 只有一页：两个按钮均不可用
$tellraw $(target) ["",{"text":"[上一页]","color":"dark_gray"},{"text":"  第 $(page)/$(pageCount) 页  ","color":"gold"},{"text":"[下一页]","color":"dark_gray"}]
