// ==UserScript==
// @name         Bilibili收藏夹分区分类
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  按分区标签对B站收藏夹视频进行分类
// @author       Your Name
// @match        *://space.bilibili.com/*/favlist*
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// ==/UserScript==

(function() {
    'use strict';

    // 获取CSRF令牌
    function getCsrf() {
        return document.cookie.match(/bili_jct=([^;]+)/)?.[1] || '';
    }

    // 获取收藏夹中的视频
    async function getFavVideos(mediaId, ps = 20, pn = 1, videos = []) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}&pn=${pn}&ps=${ps}&order=mtime&type=0&platform=web`,
                responseType: 'json',
                onload: function(response) {
                    const data = response.response.data;
                    videos = videos.concat(data.medias || []);
                    
                    if (data.has_more) {
                        getFavVideos(mediaId, ps, pn + 1, videos).then(resolve);
                    } else {
                        resolve(videos);
                    }
                },
                onerror: reject
            });
        });
    }

    // 创建新收藏夹
    async function createFolder(title) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.bilibili.com/x/v3/fav/folder/add',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: `csrf=${getCsrf()}&title=${encodeURIComponent(title)}`,
                responseType: 'json',
                onload: function(response) {
                    resolve(response.response.data.id);
                },
                onerror: reject
            });
        });
    }

    // 添加视频到收藏夹
    async function addToFav(aid, fid) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.bilibili.com/x/v3/fav/resource/deal',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: `csrf=${getCsrf()}&rid=${aid}&type=2&add_media_ids=${fid}`,
                responseType: 'json',
                onload: function(response) {
                    resolve(response.response);
                },
                onerror: reject
            });
        });
    }

    // 创建配置界面
    function createConfigUI(tidGroups) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0,0,0,0.3);
            z-index: 10000;
            max-height: 80vh;
            overflow-y: auto;
        `;

        let html = '<h3>分区分类配置</h3>';
        Object.entries(tidGroups).forEach(([tid, videos]) => {
            html += `
                <div style="margin: 10px 0;">
                    <input type="text" value="${videos[0].tname}" data-tid="${tid}">
                    <span>(${videos.length}个视频)</span>
                </div>
            `;
        });

        html += `
            <div style="margin-top: 15px">
                <button id="startClassify">开始分类</button>
                <button id="cancelClassify">取消</button>
            </div>
        `;

        modal.innerHTML = html;
        document.body.appendChild(modal);

        return new Promise((resolve, reject) => {
            document.getElementById('startClassify').onclick = () => {
                const config = {};
                modal.querySelectorAll('input[data-tid]').forEach(input => {
                    config[input.dataset.tid] = input.value;
                });
                modal.remove();
                resolve(config);
            };

            document.getElementById('cancelClassify').onclick = () => {
                modal.remove();
                reject('用户取消操作');
            };
        });
    }

    // 主处理流程
    async function processClassify() {
        try {
            // 获取当前收藏夹ID
            const fid = new URL(location.href).searchParams.get('fid');
            if (!fid) throw new Error('未找到收藏夹ID');

            // 获取所有视频
            const videos = await getFavVideos(fid);
            
            // 按分区分组
            const tidGroups = {};
            videos.forEach(video => {
                if (!tidGroups[video.tid]) {
                    tidGroups[video.tid] = [];
                }
                tidGroups[video.tid].push(video);
            });

            // 显示配置界面
            const config = await createConfigUI(tidGroups);

            // 创建新收藏夹并添加视频
            for (const [tid, folderName] of Object.entries(config)) {
                const newFid = await createFolder(folderName);
                for (const video of tidGroups[tid]) {
                    await addToFav(video.aid, newFid);
                    // 添加延时避免请求过快
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }

            alert('分类完成！');
        } catch (error) {
            console.error(error);
            alert('操作失败：' + error.message);
        }
    }

    // 添加触发按钮
    function addButton() {
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = `
            position: fixed;
            right: 20px;
            bottom: 20px;
            z-index: 9999;
        `;

        const btn = document.createElement('button');
        btn.textContent = '按分区分类';
        btn.style.cssText = `
            padding: 8px 16px;
            background: #00a1d6;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        `;
        btn.onclick = processClassify;

        btnContainer.appendChild(btn);
        document.body.appendChild(btnContainer);
    }

    // 初始化
    addButton();
})();