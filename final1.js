// ==UserScript==
// @name         Bilibili收藏夹分区分类(增强版)
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  按分区标签对B站收藏夹视频进行分类,支持手动分组
// @author       Your Name
// @match        *://space.bilibili.com/*/favlist*
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// ==/UserScript==

(function() {
    'use strict';

    // 原有函数保持不变...

    // 获取用户现有收藏夹列表
    async function getUserFolders() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://api.bilibili.com/x/v3/fav/folder/created/list-all',
                responseType: 'json',
                onload: function(response) {
                    const data = response.response.data;
                    resolve(data.list || []);
                },
                onerror: reject
            });
        });
    }

    // 创建手动分组配置界面
    async function createManualConfigUI(tidGroups) {
        const existingFolders = await getUserFolders();
        
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
            width: 80%;
            max-width: 800px;
            overflow-y: auto;
        `;

        let html = `
            <h3>手动分组配置</h3>
            <div style="margin-bottom: 20px">
                <button id="addNewGroup">添加新分组</button>
            </div>
            <div id="groupContainer">
            </div>
            <div style="margin-top: 15px">
                <button id="startManualClassify">开始分类</button>
                <button id="useAutoClassify">使用自动分类</button>
                <button id="cancelManualClassify">取消</button>
            </div>
        `;

        modal.innerHTML = html;
        document.body.appendChild(modal);

        const groupContainer = modal.querySelector('#groupContainer');
        const groups = new Map();

        function addGroup() {
            const groupDiv = document.createElement('div');
            groupDiv.style.marginBottom = '20px';
            groupDiv.style.padding = '10px';
            groupDiv.style.border = '1px solid #ddd';
            
            const groupId = Date.now();
            
            groupDiv.innerHTML = `
                <div style="margin-bottom: 10px">
                    <select class="folder-select">
                        <option value="new">创建新收藏夹</option>
                        ${existingFolders.map(f => `<option value="${f.id}">${f.title}</option>`).join('')}
                    </select>
                    <input type="text" class="new-folder-name" placeholder="新收藏夹名称" style="display:none">
                </div>
                <div class="tid-select">
                    ${Object.entries(tidGroups).map(([tid, videos]) => `
                        <label style="margin-right: 10px">
                            <input type="checkbox" data-tid="${tid}"> 
                            ${videos[0].tname} (${videos.length}个视频)
                        </label>
                    `).join('')}
                </div>
                <button class="remove-group">删除分组</button>
            `;

            const folderSelect = groupDiv.querySelector('.folder-select');
            const newFolderInput = groupDiv.querySelector('.new-folder-name');
            
            folderSelect.addEventListener('change', () => {
                newFolderInput.style.display = folderSelect.value === 'new' ? 'inline' : 'none';
            });

            groupDiv.querySelector('.remove-group').onclick = () => {
                groups.delete(groupId);
                groupDiv.remove();
            };

            groups.set(groupId, {
                element: groupDiv,
                getConfig: () => {
                    const selectedTids = [];
                    groupDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
                        selectedTids.push(cb.dataset.tid);
                    });
                    
                    return {
                        folderId: folderSelect.value,
                        newFolderName: newFolderInput.value,
                        tids: selectedTids
                    };
                }
            });

            groupContainer.appendChild(groupDiv);
        }

        modal.querySelector('#addNewGroup').onclick = addGroup;
        addGroup(); // 默认添加一个分组

        return new Promise((resolve, reject) => {
            modal.querySelector('#startManualClassify').onclick = () => {
                const config = [];
                groups.forEach(group => {
                    config.push(group.getConfig());
                });
                modal.remove();
                resolve({type: 'manual', config});
            };

            modal.querySelector('#useAutoClassify').onclick = () => {
                modal.remove();
                resolve({type: 'auto'});
            };

            modal.querySelector('#cancelManualClassify').onclick = () => {
                modal.remove();
                reject('用户取消操作');
            };
        });
    }

    // 主处理流程修改
    async function processClassify() {
        try {
            // ...原有代码...

            const manualConfig = await createManualConfigUI(tidGroups);
            
            if(manualConfig.type === 'auto') {
                // 使用原有的自动分类逻辑
                const config = await createConfigUI(tidGroups);
                // ...原有自动分类代码...
            } else {
                // 处理手动分类
                let totalProcessed = 0;
                const totalVideos = Object.values(tidGroups).reduce((sum, videos) => sum + videos.length, 0);

                for(const groupConfig of manualConfig.config) {
                    let targetFolderId = groupConfig.folderId;
                    
                    if(targetFolderId === 'new') {
                        // 检查收藏夹名是否已存在
                        const existingFolders = await getUserFolders();
                        if(existingFolders.some(f => f.title === groupConfig.newFolderName)) {
                            const newName = await new Promise(resolve => {
                                const name = prompt(`收藏夹"${groupConfig.newFolderName}"已存在，请输入新名称：`, 
                                                  groupConfig.newFolderName + '_new');
                                resolve(name);
                            });
                            if(!newName) continue;
                            groupConfig.newFolderName = newName;
                        }
                        
                        targetFolderId = await createFolder(groupConfig.newFolderName);
                    }

                    // 添加选中分区的视频
                    for(const tid of groupConfig.tids) {
                        for(const video of tidGroups[tid]) {
                            try {
                                await addToFav(video.aid, targetFolderId);
                                totalProcessed++;
                                updateProgress('正在添加视频', totalProcessed, totalVideos);
                                await new Promise(resolve => setTimeout(resolve, 300));
                            } catch(error) {
                                log(`添加视频失败：${video.title}`, 'error');
                            }
                        }
                    }
                }
            }

            log('分类完成！', 'success');
            alert('分类完成！');
        } catch(error) {
            log(error.message, 'error');
            alert('操作失败：' + error.message);
        }
    }

    // ...其余代码保持不变...

})();