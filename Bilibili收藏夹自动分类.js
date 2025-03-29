// ==UserScript==
// @name         Bilibili收藏夹自动分类
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  B站收藏夹视频自动分类
// @author       https://space.bilibili.com/1937042029,https://github.com/jqwgt
// @license      MIT
// @match        *://space.bilibili.com/*/favlist*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      api.bilibili.com
// @updateURL    https://github.com/jqwgt
// ==/UserScript==

(function() {
    'use strict';

    // 添加全局样式
    GM_addStyle(`
        .bili-classifier-container {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #222;
        }
        .bili-classifier-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            z-index: 10000;
            max-height: 80vh;
            overflow-y: auto;
            width: 700px;
            max-width: 90vw;
        }
        .bili-classifier-modal h3 {
            margin-top: 0;
            color: #00a1d6;
            font-size: 1.5em;
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
        }
        .bili-classifier-btn {
            padding: 10px 16px;
            background: #00a1d6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
            margin-right: 10px;
        }
        .bili-classifier-btn:hover {
            background: #0087b4;
            transform: translateY(-1px);
        }
        .bili-classifier-btn.secondary {
            background: #f0f0f0;
            color: #666;
        }
        .bili-classifier-btn.secondary:hover {
            background: #e0e0e0;
        }
        .bili-classifier-btn.danger {
            background: #ff4d4f;
        }
        .bili-classifier-btn.danger:hover {
            background: #ff7875;
        }
        .bili-classifier-group {
            margin: 15px 0;
            padding: 15px;
            border: 1px solid #eee;
            border-radius: 8px;
            background: #fafafa;
        }
        .bili-classifier-group-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        .bili-classifier-input {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            width: 200px;
            margin-right: 10px;
        }
        .bili-classifier-select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            width: 220px;
            margin-right: 10px;
        }
        .bili-classifier-checkbox-group {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 8px;
            margin-top: 10px;
        }
        .bili-classifier-checkbox-label {
            display: flex;
            align-items: center;
            cursor: pointer;
        }
        .bili-classifier-checkbox {
            margin-right: 8px;
        }
        .bili-classifier-footer {
            display: flex;
            justify-content: flex-end;
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #eee;
        }
        .bili-classifier-progress {
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            z-index: 10000;
            min-width: 250px;
        }
        .bili-classifier-progress-bar {
            width: 100%;
            height: 10px;
            background: #f0f0f0;
            border-radius: 5px;
            margin: 8px 0;
            overflow: hidden;
        }
        .bili-classifier-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #00a1d6, #00c4ff);
            border-radius: 5px;
            transition: width 0.3s;
        }
        .bili-classifier-float-btn {
            position: fixed;
            right: 30px;
            bottom: 30px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .bili-classifier-links {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        .bili-classifier-link-btn {
            padding: 8px 12px;
            background: #f0f0f0;
            color: #666;
            border-radius: 4px;
            text-decoration: none;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .bili-classifier-link-btn:hover {
            background: #e0e0e0;
        }
        .bili-classifier-radio-group {
            display: flex;
            gap: 15px;
            margin: 15px 0;
        }
        .bili-classifier-radio-label {
            display: flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
        }
        .bili-classifier-option-group {
            margin: 15px 0;
            padding: 15px;
            border: 1px solid #eee;
            border-radius: 8px;
        }
    `);

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

                    let currentCount = videos.length;
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
                            currentCount++;
                            updateReadingProgress(`正在读取视频，已获取 ${currentCount} 个视频`);
                            await new Promise(r => setTimeout(r, 300));
                        } catch (err) {
                            log(`获取视频 ${video.id} 信息失败`, 'error');
                        }
                    }

                    if (data.has_more) {
                        await getFavVideos(mediaId, ps, pn + 1, videos).then(resolve);
                    } else {
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

    // 从收藏夹移除视频
    async function removeFromFav(aid, fid) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.bilibili.com/x/v3/fav/resource/deal',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: `csrf=${getCsrf()}&rid=${aid}&type=2&del_media_ids=${fid}`,
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
        modal.className = 'bili-classifier-container bili-classifier-modal';

        let html = `
            <h3>收藏夹自动分类</h3>

            <div class="bili-classifier-radio-group">
                <label class="bili-classifier-radio-label">
                    <input type="radio" name="operationMode" value="copy" checked> 复制模式
                </label>
                <label class="bili-classifier-radio-label">
                    <input type="radio" name="operationMode" value="move"> 移动模式
                </label>
            </div>

            <div class="bili-classifier-option-group">
                <label class="bili-classifier-checkbox-label">
                    <input type="checkbox" id="autoClassifyUnassigned" checked>
                    对未自定义分组的视频自动按分区分类
                </label>
            </div>

            <div style="margin-bottom: 20px">
                <button class="bili-classifier-btn" id="addCustomGroup">添加自定义分组</button>
            </div>
            <div id="customGroups"></div>
            <div id="defaultGroups">
                <h4>视频分区分组</h4>
        `;

        Object.entries(tidGroups).forEach(([tid, videos]) => {
            html += `
                <div class="bili-classifier-group tid-group" data-tid="${tid}">
                    <div class="bili-classifier-group-header">
                        <span>${videos[0].tname} (${videos.length}个视频)</span>
                    </div>
                </div>
            `;
        });

        html += `
            </div>
            <div class="bili-classifier-footer">
                <button class="bili-classifier-btn secondary" id="cancelClassify">取消</button>
                <button class="bili-classifier-btn" id="startClassify">开始分类</button>
            </div>

            <div class="bili-classifier-links">
                <a href="https://space.bilibili.com/1937042029" target="_blank" class="bili-classifier-link-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="#666"/>
                        <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="#666"/>
                    </svg>
                    我的B站主页
                </a>
                <a href="https://github.com/jqwgt" target="_blank" class="bili-classifier-link-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" fill="#666"/>
                    </svg>
                    GitHub项目
                </a>
            </div>
        `;

        modal.innerHTML = html;
        document.body.appendChild(modal);

        let existingFolders = [];
        let customGroups = [];
        let operationMode = 'copy'; // 默认复制模式
        let autoClassifyUnassigned = true; // 默认自动分类未分组视频

        // 获取操作模式
        modal.querySelectorAll('input[name="operationMode"]').forEach(radio => {
            radio.addEventListener('change', function() {
                operationMode = this.value;
            });
        });

        // 获取自动分类选项
        modal.querySelector('#autoClassifyUnassigned').addEventListener('change', function() {
            autoClassifyUnassigned = this.checked;
        });

        // 获取现有收藏夹
        getUserFavLists().then(folders => {
            existingFolders = folders;
        });

        // 添加自定义分组的处理
        document.getElementById('addCustomGroup').onclick = async () => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'bili-classifier-group custom-group';

            const tidOptions = Object.entries(tidGroups)
                .map(([tid, videos]) => `
                    <label class="bili-classifier-checkbox-label">
                        <input type="checkbox" class="bili-classifier-checkbox" value="${tid}">
                        ${videos[0].tname} (${videos.length}个视频)
                    </label>
                `).join('');

            groupDiv.innerHTML = `
                <div class="bili-classifier-group-header">
                    <input type="text" class="bili-classifier-input folder-name" placeholder="新收藏夹名称">
                    <button class="bili-classifier-btn secondary use-existing">使用现有收藏夹</button>
                    <button class="bili-classifier-btn danger remove-group">删除分组</button>
                </div>
                <div class="bili-classifier-checkbox-group tid-options">
                    ${tidOptions}
                </div>
            `;

            document.getElementById('customGroups').appendChild(groupDiv);

            // 使用现有收藏夹按钮处理
            groupDiv.querySelector('.use-existing').onclick = () => {
                const select = document.createElement('select');
                select.className = 'bili-classifier-select';
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
                    default: {},
                    operationMode: operationMode,
                    autoClassifyUnassigned: autoClassifyUnassigned
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

                // 收集默认分组配置（仅在用户选择自动分类时）
                if (autoClassifyUnassigned) {
                    Object.keys(tidGroups).forEach(tid => {
                        if (!config.custom.some(g => g.tids.includes(tid))) {
                            config.default[tid] = tidGroups[tid][0].tname;
                        }
                    });
                }

                modal.remove();
                resolve(config);
            };

            document.getElementById('cancelClassify').onclick = () => {
                modal.remove();
                reject('用户取消操作');
            };
        });
    }

    // 创建读取视频进度显示
    function createReadingProgressDiv() {
        const div = document.createElement('div');
        div.id = 'reading-progress';
        div.className = 'bili-classifier-progress';
        div.innerHTML = `
            <div>正在读取视频...</div>
            <div class="bili-classifier-progress-bar">
                <div class="bili-classifier-progress-fill" style="width: 0%"></div>
            </div>
        `;
        document.body.appendChild(div);
        return div;
    }

    // 更新读取视频进度
    function updateReadingProgress(message) {
        const progressDiv = document.getElementById('reading-progress') || createReadingProgressDiv();
        progressDiv.querySelector('div:first-child').textContent = message;
    }

    // 创建进度显示
    function createProgressDiv() {
        const div = document.createElement('div');
        div.id = 'fav-progress';
        div.className = 'bili-classifier-progress';
        div.innerHTML = `
            <div>正在处理...</div>
            <div class="bili-classifier-progress-bar">
                <div class="bili-classifier-progress-fill" style="width: 0%"></div>
            </div>
            <div>0/0</div>
        `;
        document.body.appendChild(div);
        return div;
    }

    // 更新进度显示
    function updateProgress(message, current, total) {
        const progressDiv = document.getElementById('fav-progress') || createProgressDiv();
        progressDiv.querySelector('div:first-child').textContent = message;
        progressDiv.querySelector('.bili-classifier-progress-fill').style.width = `${(current/total)*100}%`;
        progressDiv.querySelector('div:last-child').textContent = `${current}/${total}`;
    }

    // 主处理流程
    async function processClassify() {
        let totalProcessed = 0;
        let totalVideos = 0;
        const sourceFid = new URL(location.href).searchParams.get('fid');

        try {
            if (!sourceFid) throw new Error('未找到收藏夹ID');

            log('开始获取收藏夹视频...');
            const videos = await getFavVideos(sourceFid);
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
                let targetFid;
                if (group.isExisting) {
                    targetFid = group.fid;
                } else {
                    // 检查收藏夹名称是否存在
                    const existingFolders = await getUserFavLists();
                    let folderName = group.name;
                    let counter = 1;

                    while (existingFolders.some(f => f.title === folderName)) {
                        folderName = `${group.name}_${counter++}`;
                        log(`收藏夹名称"${group.name}"已存在，尝试使用"${folderName}"`, 'info');
                    }

                    targetFid = await createFolder(folderName);
                }

                // 添加选中分区的视频
                for (const tid of group.tids) {
                    for (const video of tidGroups[tid]) {
                        await addToFav(video.aid, targetFid);
                        if (userConfig.operationMode === 'move') {
                            await removeFromFav(video.aid, sourceFid);
                        }
                        totalProcessed++;
                        updateProgress(`正在处理视频到分组"${group.name}"`, totalProcessed, totalVideos);
                        await new Promise(r => setTimeout(r, 300));
                    }
                }
            }

            // 处理未分组的视频（仅在用户选择自动分类时）
            if (userConfig.autoClassifyUnassigned) {
                for (const [tid, folderName] of Object.entries(userConfig.default)) {
                    if (!userConfig.custom.some(g => g.tids.includes(tid))) {
                        const targetFid = await createFolder(folderName);
                        for (const video of tidGroups[tid]) {
                            await addToFav(video.aid, targetFid);
                            if (userConfig.operationMode === 'move') {
                                await removeFromFav(video.aid, sourceFid);
                            }
                            totalProcessed++;
                            updateProgress(`正在处理视频到"${folderName}"`, totalProcessed, totalVideos);
                            await new Promise(r => setTimeout(r, 300));
                        }
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

    // 添加触发按钮和链接
    function addButton() {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'bili-classifier-float-btn';

        const btn = document.createElement('button');
        btn.className = 'bili-classifier-btn';
        btn.textContent = '按分区分类';
        btn.onclick = processClassify;

        const links = document.createElement('div');
        links.className = 'bili-classifier-links';
        links.innerHTML = `
            <a href="https://space.bilibili.com/1937042029" target="_blank" class="bili-classifier-link-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="#666"/>
                    <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="#666"/>
                </svg>
                我的B站
            </a>
            <a href="https://github.com/jqwgt" target="_blank" class="bili-classifier-link-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" fill="#666"/>
                </svg>
                GitHub
            </a>
        `;

        btnContainer.appendChild(btn);
        btnContainer.appendChild(links);
        document.body.appendChild(btnContainer);
    }

    // 初始化
    addButton();
})();
