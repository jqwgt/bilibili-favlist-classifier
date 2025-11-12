# Bilibili 收藏夹分类器  

一个 Node.js 脚本，用于获取 Bilibili 收藏夹中的所有视频，并按 UP主 进行分类。  

## 环境要求  

- Node.js (推荐 v16 或更高版本)  
- npm  

## 安装与配置  

1.  **克隆仓库**  
    ```bash  
    git clone <repository-url>  
    cd bilibili-favlist-classifier  
    ```  

2.  **安装依赖**  
    ```bash  
    npm install  
    ```  

3.  **配置**  
    在项目根目录中，通过复制 `config.example.json` 来创建一个 `config.json` 文件。  
    ```bash  
    cp config.example.json config.json  
    ```  
    然后，编辑 `config.json` 文件，并填入你的 Bilibili `SESSDATA` Cookie 和目标收藏夹的 `media_id`。  

    - `SESSDATA`: 你的 Bilibili 登录 Cookie。登录 bilibili.com 后，你可以在浏览器的开发者工具中找到它。  
    - `media_id`: 你想要处理的收藏夹 ID。你可以在收藏夹页面的 URL 中找到它 (例如, `https://space.bilibili.com/你的UID/favlist?fid=MEDIA_ID` )。  

## 如何使用  

在项目根目录运行脚本：  

```bash  
node src/index.js  
```  

脚本将开始获取视频列表。完成后，它会生成一个 `result.json` 文件，其中包含按 UP主 分好类的视频信息。  

## 输出示例 (`result.json`)  

```json  
{  
  "UP主A": [  
    {  
      "title": "视频标题1",  
      "bvid": "BV1xx411c7xX",  
      "url": "https://www.bilibili.com/video/BV1xx411c7xX"  
    }  
  ],  
  "UP主B": [  
    {  
      "title": "视频标题2",  
      "bvid": "BV1yy411c7yY",  
      "url": "https://www.bilibili.com/video/BV1yy411c7yY"  
    },  
    {  
      "title": "视频标题3",  
      "bvid": "BV1zz411c7zZ",  
      "url": "https://www.bilibili.com/video/BV1zz411c7zZ"  
    }  
  ]  
}  
```