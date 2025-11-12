# B站关注列表自动分类器

一个专门用于B站关注列表按UP主投稿分区自动分类的篡改猴脚本，基于 [BiliScope](https://github.com/gaogaotiantian/biliscope) 项目的真实算法实现。

## ? 功能特点

### ? 分组范围控制
- **当前分组限制**: 仅对当前打开的关注分组生效，支持不同tagid的精确操作
- **URL检测**: 自动识别 `?tagid=0`（全部关注）和 `?tagid=xxx`（特定分组）
- **安全操作**: 避免误操作影响其他分组的关注用户

### ? 真实算法实现
- **BiliScope算法**: 完全基于BiliScope项目的真实源码实现
- **typeid统计**: 通过分析UP主投稿视频的typeid来确定最常投稿分区
- **精确API调用**: 使用与BiliScope相同的API参数和请求方式

### ? 高性能设计
- **并发控制**: 支持多UP主并发分析，6个worker并发处理
- **批量操作**: 分批添加用户到标签，每批最多20个用户
- **请求限流**: 合理控制API调用频率，避免触发风控

### ? 智能分类
- **最常投稿分区**: 自动分析每个UP主的历史投稿，统计各分区视频数量，选择最活跃的分区作为标签
- **自定义分组**: 支持手动创建分组，可以将多个分区的UP主归类到一个标签下
- **现有标签复用**: 可以选择使用已有的关注标签，避免重复创建

### ? 操作模式
- **复制模式**: 在现有分组基础上添加新标签（推荐）
- **移动模式**: 清除原有分组并重新分类

### ? 数据统计
- 实时显示分析进度
- 按UP主数量排序显示各分区分布
- 一键选择高活跃分区进行分类

## ? 安装使用

### 前置条件
- 安装 [Tampermonkey](https://www.tampermonkey.net/) 或其他支持用户脚本的浏览器扩展
- 已登录B站账号

### 安装步骤
1. 复制 `bilibili-follow-classifier.js` 中的脚本代码
2. 在Tampermonkey中创建新脚本，粘贴代码并保存
3. 访问B站关注页面 (`https://space.bilibili.com/用户ID/relation/follow`)，右下角会出现"?? 关注分类"按钮

### 页面适配
脚本会自动在以下页面激活：
- `https://space.bilibili.com/用户ID/relation/follow?tagid=0` (全部关注)
- `https://space.bilibili.com/用户ID/relation/follow?tagid=分组ID` (特定关注分组)

### 使用方法
1. 在关注页面点击"?? 关注分类"按钮
2. 等待脚本自动分析当前分组内所有UP主的投稿分区
3. 在配置界面中：
   - 选择操作模式（复制/移动）
   - 可添加自定义分组（将多个分区合并到一个标签）
   - 可选择"自动分类未分组UP主"
4. 点击"开始分类"执行操作

## ? 技术实现

### 分组范围检测
```javascript
function getCurrentTagId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('tagid') || '0'; // 默认为全部关注
}
```
脚本会自动检测当前URL中的tagid参数，确保只对当前分组进行操作。

### BiliScope真实算法
基于 [gaogaotiantian/biliscope](https://github.com/gaogaotiantian/biliscope) 的源码分析，UP主分区确定流程：

1. **API调用**: 使用与BiliScope相同的API和参数
```javascript
await wbiRequest('https://api.bilibili.com/x/space/wbi/arc/search', {
    mid: mid,
    pn: pn,
    ps: ps,
    index: 1,              // BiliScope使用的参数
    order: "pubdate",
    order_avoided: "true"  // BiliScope使用的参数
});
```

2. **typeid统计**: 遍历视频列表统计各分区视频数量
```javascript
videos.forEach(video => {
    if (video.typeid) {
        tidCount[video.typeid] = (tidCount[video.typeid] || 0) + 1;
    }
});
```

3. **最优分区选择**: 选择视频数量最多的分区
```javascript
Object.entries(tidCount).forEach(([tid, count]) => {
    if (count > maxCount) {
        maxCount = count;
        topTid = parseInt(tid);
    }
});
```
```javascript
// 使用B站最新的WBI签名算法，避免风控
async function wbiRequest(url, params = {}) {
    const mixin = await getWbiMixinKey();
    const p = { ...params, wts: Math.floor(Date.now() / 1000) };
    const qs = encodeWbi(p);
    const w_rid = md5(qs + mixin);
    return fetchWithSign(url, qs, w_rid);
}
```

#### 2. 批量投稿分析
```javascript
// 一次性获取UP主的多个投稿，在本地统计分区
async function getUploaderTopCategory(mid, maxVideos = 60) {
    const tidCount = {};
    // 分页获取投稿列表
    while (totalProcessed < maxVideos) {
        const videos = await getVideoList(mid, pn++);
        videos.forEach(video => {
            tidCount[video.typeid] = (tidCount[video.typeid] || 0) + 1;
        });
    }
    // 返回最高频分区
    return findMostFrequentCategory(tidCount);
}
```

#### 3. 并发控制
```javascript
// 并发处理多个UP主，提升整体速度
const categoryResults = await runWithConcurrency(
    followingList,
    getUploaderTopCategory,
    6 // 并发数控制
);
```

### API接口使用

| 接口 | 用途 | 性能优势 |
|------|------|----------|
| `/x/relation/followings` | 获取关注列表 | 分页批量获取 |
| `/x/space/wbi/arc/search` | 获取UP主投稿 | WBI签名，批量分析 |
| `/x/relation/tags` | 管理关注标签 | 复用现有标签 |
| `/x/relation/tags/addUsers` | 批量添加用户到标签 | 批量操作，减少请求次数 |

## ? 性能对比

| 方案 | 处理100个UP主耗时 | 优势 |
|------|-------------------|------|
| 原方案（逐个视频） | ~100秒 | 数据准确 |
| **本方案（批量分析）** | ~20秒 | **速度快5倍，准确度高** |
| BiliScope方案 | ~15秒 | 鼠标悬停即时显示 |

## ? 界面设计

- **现代化UI**: 使用卡片式设计，支持响应式布局
- **实时进度**: 显示处理进度条和当前状态
- **智能提示**: 提供操作建议和数据统计
- **分区预览**: 按UP主数量排序显示分区分布

## ?? 注意事项

1. **请求频率**: 脚本内置了请求间隔控制，避免触发B站风控
2. **数据准确性**: 基于UP主近期投稿（默认60个视频）进行分析
3. **标签限制**: B站关注标签数量有限制，建议合理规划分组
4. **权限要求**: 需要登录状态，建议在主页面执行

## ? 贡献

本项目参考了以下优秀项目：
- [BiliScope](https://github.com/gaogaotiantian/biliscope) - WBI签名算法和性能优化思路
- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) - B站API接口文档

## ? 许可证

GPL-3.0-or-later

## ? 相关链接

- [作者B站主页](https://space.bilibili.com/1937042029)
- [项目GitHub](https://github.com/jqwgt/bilibili-favlist-classifier)
- [问题反馈](https://github.com/jqwgt/bilibili-favlist-classifier/issues)
