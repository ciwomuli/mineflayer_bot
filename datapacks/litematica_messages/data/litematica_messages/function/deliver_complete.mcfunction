# 参数：target、deliveredQuantity、quantity、id、fakePlayerName
$tellraw $(target) ["",{"text":"已将 ","color":"green"},{"text":"$(deliveredQuantity)/$(quantity)","color":"aqua","bold":true},{"text":" 个 ","color":"green"},{"text":"$(id)","color":"yellow"},{"text":" 交付给你，请在假人 ","color":"green"},{"text":"$(fakePlayerName)","color":"light_purple","bold":true},{"text":" 处领取","color":"green"}]
