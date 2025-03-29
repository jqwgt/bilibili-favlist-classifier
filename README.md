# Bilibili收藏夹自动分类

## 简介

这是一个用于自动分类B站收藏夹视频的Tampermonkey脚本。该脚本会根据视频的分区自动将视频分类到不同的收藏夹中，并在页面右侧显示读取视频的进度。

## 功能

- 自动获取B站收藏夹中的视频
- 根据视频分区自动分类视频到不同的收藏夹
- 支持复制和移动两种模式
- 支持自定义分组和使用现有收藏夹，通过"对未自定义分组的视频自动按分区分类"的复选框决定是否自动按分区分类
- 在页面右侧显示读取视频的进度。在读取阶段想要查看每个视频的详细信息可以按F12开发者工具在终端查看日志

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 插件。
2. 点击 [此处](https://github.com/jqwgt) 安装脚本。

## 使用方法

1. 打开你的B站用户空间的收藏夹页面，例如 `https://space.bilibili.com/你的UID/favlist`。
2. 页面右下角会出现一个“按分区分类”按钮，点击该按钮开始分类。
3. 在弹出的配置界面中，可以设置复制或移动模式，可以添加自定义分组或使用现有收藏夹，并指定是否对未自定义分区的视频按照分区信息进行分类。
4. 配置完成后，点击“开始分类”按钮，脚本会自动创建需要的收藏夹并将视频分类到对应的收藏夹中。

## 注意事项

- 注意运行前请先清除收藏夹内的已失效视频，否则会报错！！！！！
- 请确保已登录B站账号，并且具有操作当前收藏夹的权限。
- 脚本会在控制台输出日志信息，方便调试和查看进度。
- 由于B站API的限制，脚本在获取视频信息时会有一定的延迟，请耐心等待。
- 出现其他报错，刷新即可。


## 开发者

- [我的github](https://github.com/jqwgt)
- [我的B站空间](https://space.bilibili.com/1937042029)

## 许可证

GPL-3.0 License
