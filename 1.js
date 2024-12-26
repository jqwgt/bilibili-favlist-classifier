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

    // 添加日志功能
    function log(message, type = 'info') {
        const styles = {
            info: 'color: #00a1d6',
            error: 'color: #ff0000',
            success: 'color: #00ff00'
        };
        console.log(`%c[收藏夹分类] ${message}`, styles[type]);
    }

    // 获取视频详细信息
    async function getVideoInfo(aid) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/web-interface/view?aid=${aid}`,
                responseType: 'json',
                onload: function(response) {
                    const data = response.response.data;
                    log(`获取视频 ${aid} 详细信息:`, 'info');
                    console.table({
                        标题: data.title,
                        分区ID: data.tid,
                        分区名: data.tname,
                        播放量: data.stat.view,
                    });
                    resolve(data);
                },
                onerror: reject
            });
        });
    }

    // 获取收藏夹中的视频
    async function getFavVideos(mediaId, ps = 20, pn = 1, videos = []) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}&pn=${pn}&ps=${ps}&order=mtime&type=0&platform=web`,
                responseType: 'json',
                onload: async function(response) {
                    const data = response.response.data;
                    log(`收藏夹API返回数据:`, 'info');
                    console.log(data);
                    
                    if (!data || !data.medias) {
                        reject('获取视频列表失败');
                        return;
                    }

                    // 获取每个视频的详细信息
                    for (let video of data.medias) {
                        try {
                            const videoInfo = await getVideoInfo(video.id);
                            videos.push({
                                aid: video.id,
                                title: video.title,
                                tid: videoInfo.tid,
                                tname: videoInfo.tname,
                                play: videoInfo.stat.view
                            });
                            // 避免请求过快
                            await new Promise(r => setTimeout(r, 300));
                        } catch (err) {
                            log(`获取视频 ${video.id} 信息失败`, 'error');
                        }
                    }

                    if (data.has_more) {
                        await getFavVideos(mediaId, ps, pn + 1, videos).then(resolve);
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

    // 修改进度显示样式
    function updateProgress(message, current, total) {
        const progressDiv = document.getElementById('fav-progress') || createProgressDiv();
        progressDiv.innerHTML = `
            <div style="margin-bottom: 5px">${message}</div>
            <div style="width: 200px; background: #ddd; height: 20px; border-radius: 10px;">
                <div style="width: ${(current/total)*100}%; background: #00a1d6; height: 100%; border-radius: 10px;"></div>
            </div>
            <div style="margin-top: 5px">${current}/${total}</div>
        `;
    }

    function createProgressDiv() {
        const div = document.createElement('div');
        div.id = 'fav-progress';
        div.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(255,255,255,0.9);
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            z-index: 10000;
        `;
        document.body.appendChild(div);
        return div;
    }

    // 主处理流程
    async function processClassify() {
        try {
            const fid = new URL(location.href).searchParams.get('fid');
            if (!fid) throw new Error('未找到收藏夹ID');
            
            log('开始获取收藏夹视频...');
            const videos = await getFavVideos(fid);
            
            // 验证视频信息
            if (!videos.length) {
                throw new Error('未获取到视频');
            }
            
            log('开始按分区分组...');
            const tidGroups = {};
            videos.forEach(video => {
                // 尝试从不同可能的字段获取分区信息
                const tid = video.tid || video.typeid;
                const tname = video.tname || video.typename;
                
                if (!tid || !tname) {
                    log(`警告：视频 ${video.title} (aid: ${video.aid}) 缺少分区信息`, 'error');
                    console.log('完整视频数据:', video);
                    return;
                }
                
                if (!tidGroups[tid]) {
                    tidGroups[tid] = [];
                }
                tidGroups[tid].push(video);
            });
            
            log('分组结果：');
            Object.entries(tidGroups).forEach(([tid, videos]) => {
                log(`分区 ${videos[0].tname}：${videos.length}个视频`);
            });
            
            const config = await createConfigUI(tidGroups);
            
            // 创建进度显示
            const progressDiv = document.createElement('div');
            progressDiv.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 10px;
                border-radius: 4px;
                z-index: 10000;
            `;
            document.body.appendChild(progressDiv);
            
            // 执行收藏操作
            let totalProcessed = 0;
            const totalVideos = Object.values(tidGroups).reduce((sum, videos) => sum + videos.length, 0);
            
            for (const [tid, folderName] of Object.entries(config)) {
                log(`创建收藏夹：${folderName}`);
                const newFid = await createFolder(folderName);
                
                if (!newFid) {
                    log(`创建收藏夹 ${folderName} 失败`, 'error');
                    continue;
                }
                
                for (const video of tidGroups[tid]) {
                    try {
                        await addToFav(video.aid, newFid);
                        totalProcessed++;
                        updateProgress(`正在添加视频到 ${folderName}`, totalProcessed, totalVideos);
                        log(`添加视频：${video.title}`);
                        await new Promise(resolve => setTimeout(resolve, 300));
                    } catch (error) {
                        log(`添加视频失败：${video.title}`, 'error');
                    }
                }
            }
            
            progressDiv.remove();
            log('分类完成！', 'success');
            alert('分类完成！');
        } catch (error) {
            log(error.message, 'error');
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