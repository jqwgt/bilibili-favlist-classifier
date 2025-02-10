// ==UserScript==
// @name         Bilibili收藏夹自动分类
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  B站收藏夹视频自动分类
// @author       https://space.bilibili.com/1937042029,https://github.com/jqwgt
// @license      MIT
// @match        *://space.bilibili.com/*/favlist*
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// @updateURL    https://github.com/jqwgt
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

    // 获取用户收藏夹
    async function getUserFavLists() {
        const mid = window.location.pathname.split('/')[1];
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`,
                responseType: 'json',
                onload: function(response) {
                    resolve(response.response.data.list || []);
                },
                onerror: reject
            });
        });
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
        // 初始化页面右侧的读取视频进度显示
        if (!document.getElementById('reading-progress')) {
            createReadingProgressDiv();
        }
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
    
                    // 记录已读取的视频数量（累加前几个页面已读取的视频数）
                    let currentCount = videos.length;
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
                            // 更新右侧的读取视频进度显示
                            currentCount++;
                            updateReadingProgress(`正在读取视频，已获取 ${currentCount} 个视频`);
                            // 避免请求过快
                            await new Promise(r => setTimeout(r, 300));
                        } catch (err) {
                            log(`获取视频 ${video.id} 信息失败`, 'error');
                        }
                    }
    
                    if (data.has_more) {
                        await getFavVideos(mediaId, ps, pn + 1, videos).then(resolve);
                    } else {
                        // 完成后移除读取视频进度显示
                        document.getElementById('reading-progress')?.remove();
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
            width: 600px;
        `;

        let html = `
            <h3>分区分类配置</h3>
            <div style="margin-bottom: 20px">
                <button id="addCustomGroup">添加自定义分组</button>
            </div>
            <div id="customGroups"></div>
            <div id="defaultGroups">
                <h4>默认分区分组</h4>
        `;

        Object.entries(tidGroups).forEach(([tid, videos]) => {
            html += `
                <div style="margin: 10px 0;" class="tid-group" data-tid="${tid}">
                    <input type="text" value="${videos[0].tname}" data-tid="${tid}">
                    <span>(${videos.length}个视频)</span>
                </div>
            `;
        });

        html += `
            </div>
            <div style="margin-top: 15px">
                <button id="startClassify">开始分类</button>
                <button id="cancelClassify">取消</button>
            </div>
        `;

        modal.innerHTML = html;
        document.body.appendChild(modal);

        let existingFolders = [];
        let customGroups = [];

        // 获取现有收藏夹
        getUserFavLists().then(folders => {
            existingFolders = folders;
        });

        // 添加自定义分组的处理
        document.getElementById('addCustomGroup').onclick = async () => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'custom-group';
            groupDiv.style.margin = '10px 0';
            groupDiv.style.padding = '10px';
            groupDiv.style.border = '1px solid #ddd';

            const tidOptions = Object.entries(tidGroups)
                .map(([tid, videos]) => `
                    <label style="display: block; margin: 5px 0;">
                        <input type="checkbox" value="${tid}"> ${videos[0].tname} (${videos.length}个视频)
                    </label>
                `).join('');

            groupDiv.innerHTML = `
                <div style="margin-bottom: 10px">
                    <input type="text" placeholder="新收藏夹名称" class="folder-name">
                    <button class="use-existing">使用现有收藏夹</button>
                    <button class="remove-group">删除分组</button>
                </div>
                <div class="tid-options">
                    ${tidOptions}
                </div>
            `;

            document.getElementById('customGroups').appendChild(groupDiv);

            // 使用现有收藏夹按钮处理
            groupDiv.querySelector('.use-existing').onclick = () => {
                const select = document.createElement('select');
                select.innerHTML = `
                    <option value="">选择现有收藏夹</option>
                    ${existingFolders.map(f => `<option value="${f.id}">${f.title}</option>`).join('')}
                `;
                const input = groupDiv.querySelector('.folder-name');
                input.parentNode.replaceChild(select, input);
            };

            // 删除分组按钮处理
            groupDiv.querySelector('.remove-group').onclick = () => {
                groupDiv.remove();
            };
        };

        return new Promise((resolve, reject) => {
            document.getElementById('startClassify').onclick = () => {
                const config = {
                    custom: [],
                    default: {}
                };

                // 收集自定义分组配置
                document.querySelectorAll('.custom-group').forEach(group => {
                    const nameInput = group.querySelector('.folder-name, select');
                    const selectedTids = Array.from(group.querySelectorAll('input[type="checkbox"]:checked'))
                        .map(cb => cb.value);

                    if (selectedTids.length > 0 && nameInput.value) {
                        config.custom.push({
                            name: nameInput.value,
                            isExisting: nameInput.tagName === 'SELECT',
                            fid: nameInput.tagName === 'SELECT' ? nameInput.value : null,
                            tids: selectedTids
                        });
                    }
                });

                // 收集默认分组配置
                document.querySelectorAll('#defaultGroups input[data-tid]').forEach(input => {
                    const tid = input.dataset.tid;
                    if (!config.custom.some(g => g.tids.includes(tid))) {
                        config.default[tid] = input.value;
                    }
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

    // 进度显示样式
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
    // 在 updateProgress 函数后增加下面两个辅助函数，用于显示读取视频进度
    function createReadingProgressDiv() {
        let div = document.getElementById('reading-progress');
        if (!div) {
            div = document.createElement('div');
            div.id = 'reading-progress';
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
        }
        return div;
    }

function updateReadingProgress(message) {
    const progressDiv = document.getElementById('reading-progress') || createReadingProgressDiv();
    progressDiv.innerHTML = `<div style="margin-bottom: 5px">${message}</div>`;
}
    // 更新进度显示样式，修改位置到页面右下角
    function createProgressDiv() {
        const div = document.createElement('div');
        div.id = 'fav-progress';
        div.style.cssText = `
            position: fixed;
            bottom: 20px;
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
        let totalProcessed = 0;
        let totalVideos = 0;

        try {
            const fid = new URL(location.href).searchParams.get('fid');
            if (!fid) throw new Error('未找到收藏夹ID');

            log('开始获取收藏夹视频...');
            const videos = await getFavVideos(fid);
            if (!videos.length) throw new Error('未找到视频');

            // 按分区分组视频
            const tidGroups = {};
            videos.forEach(video => {
                if (!tidGroups[video.tid]) {
                    tidGroups[video.tid] = [];
                }
                tidGroups[video.tid].push(video);
            });

            totalVideos = videos.length;

            // 获取用户配置
            const userConfig = await createConfigUI(tidGroups);

            // 处理自定义分组
            for (const group of userConfig.custom) {
                let newFid;
                if (group.isExisting) {
                    newFid = group.fid;
                } else {
                    // 检查收藏夹名称是否存在
                    const existingFolders = await getUserFavLists();
                    let folderName = group.name;
                    let counter = 1;

                    while (existingFolders.some(f => f.title === folderName)) {
                        folderName = `${group.name}_${counter++}`;
                        log(`收藏夹名称"${group.name}"已存在，尝试使用"${folderName}"`, 'info');
                    }

                    newFid = await createFolder(folderName);
                }

                // 添加选中分区的视频
                for (const tid of group.tids) {
                    for (const video of tidGroups[tid]) {
                        await addToFav(video.aid, newFid);
                        totalProcessed++;
                        updateProgress(`正在添加视频到分组"${group.name}"`, totalProcessed, totalVideos);
                        await new Promise(r => setTimeout(r, 300));
                    }
                }
            }

            // 处理未分组的视频
            for (const [tid, folderName] of Object.entries(userConfig.default)) {
                if (!userConfig.custom.some(g => g.tids.includes(tid))) {
                    const newFid = await createFolder(folderName);
                    for (const video of tidGroups[tid]) {
                        await addToFav(video.aid, newFid);
                        totalProcessed++;
                        updateProgress(`正在添加视频到"${folderName}"`, totalProcessed, totalVideos);
                        await new Promise(r => setTimeout(r, 300));
                    }
                }
            }

            document.getElementById('fav-progress')?.remove();
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