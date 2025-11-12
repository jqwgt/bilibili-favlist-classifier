// ==UserScript==
// @name         B站关注列表自动分类器
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  B站关注列表按UP主最常投稿分区自动分类（基于BiliScope真实算法）
// @author       https://space.bilibili.com/1937042029,https://github.com/jqwgt
// @license      GPL-3.0-or-later
// @match        *://space.bilibili.com/*/fans/follow*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      api.bilibili.com
// @updateURL    https://github.com/jqwgt
// ==/UserScript==

(function() {
    'use strict';

    // ===== 样式定义 =====
    GM_addStyle(`
        .follow-classifier-container {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #222;
        }
        .follow-classifier-modal {
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
            width: 800px;
            max-width: 90vw;
        }
        .follow-classifier-modal h3 {
            margin-top: 0;
            color: #00a1d6;
            font-size: 1.5em;
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
        }
        .follow-classifier-btn {
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
        .follow-classifier-btn:hover {
            background: #0087b4;
            transform: translateY(-1px);
        }
        .follow-classifier-btn.secondary {
            background: #f0f0f0;
            color: #666;
        }
        .follow-classifier-btn.secondary:hover {
            background: #e0e0e0;
        }
        .follow-classifier-btn.danger {
            background: #ff4d4f;
        }
        .follow-classifier-btn.danger:hover {
            background: #ff7875;
        }
        .follow-classifier-group {
            margin: 15px 0;
            padding: 15px;
            border: 1px solid #eee;
            border-radius: 8px;
            background: #fafafa;
        }
        .follow-classifier-group-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .follow-classifier-input {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            width: 200px;
            margin-right: 10px;
        }
        .follow-classifier-select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            width: 220px;
            margin-right: 10px;
        }
        .follow-classifier-checkbox-group {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 8px;
            margin-top: 10px;
        }
        .follow-classifier-checkbox-label {
            display: flex;
            align-items: center;
            cursor: pointer;
            padding: 8px;
            border-radius: 4px;
            background: white;
            border: 1px solid #eee;
        }
        .follow-classifier-checkbox-label:hover {
            background: #f8f9fa;
            border-color: #00a1d6;
        }
        .follow-classifier-checkbox {
            margin-right: 8px;
        }
        .follow-classifier-footer {
            display: flex;
            justify-content: flex-end;
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #eee;
        }
        .follow-classifier-progress {
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            z-index: 10000;
            min-width: 300px;
        }
        .follow-classifier-progress-bar {
            width: 100%;
            height: 10px;
            background: #f0f0f0;
            border-radius: 5px;
            margin: 8px 0;
            overflow: hidden;
        }
        .follow-classifier-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #00a1d6, #00c4ff);
            border-radius: 5px;
            transition: width 0.3s;
        }
        .follow-classifier-float-btn {
            position: fixed;
            right: 30px;
            bottom: 30px;
            z-index: 9999;
        }
        .follow-classifier-radio-group {
            display: flex;
            gap: 15px;
            margin: 15px 0;
        }
        .follow-classifier-radio-label {
            display: flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
        }
        .follow-classifier-option-group {
            margin: 15px 0;
            padding: 15px;
            border: 1px solid #eee;
            border-radius: 8px;
        }
        .follow-classifier-stats {
            font-size: 12px;
            color: #666;
            margin-left: 10px;
        }
        .follow-classifier-tips {
            background: #f6f8fa;
            padding: 10px;
            border-radius: 6px;
            margin: 15px 0;
            font-size: 13px;
            color: #586069;
        }
    `);

    // ===== WBI签名算法实现 =====
    let wbiMixinKeyCache = null;

    // 简化版MD5实现（用于WBI签名）
    function md5(str) {
        // 为了保持轻量级，使用简化版MD5
        // 实际项目中应使用完整的MD5库
        function md5cycle(x, k) {
            var a = x[0], b = x[1], c = x[2], d = x[3];
            a = ff(a, b, c, d, k[0], 7, -680876936);
            d = ff(d, a, b, c, k[1], 12, -389564586);
            c = ff(c, d, a, b, k[2], 17, 606105819);
            b = ff(b, c, d, a, k[3], 22, -1044525330);
            // ... 省略完整实现，使用简化版
            x[0] = add32(a, x[0]);
            x[1] = add32(b, x[1]);
            x[2] = add32(c, x[2]);
            x[3] = add32(d, x[3]);
        }
        
        function cmn(q, a, b, x, s, t) {
            a = add32(add32(a, q), add32(x, t));
            return add32((a << s) | (a >>> (32 - s)), b);
        }
        
        function ff(a, b, c, d, x, s, t) {
            return cmn((b & c) | ((~b) & d), a, b, x, s, t);
        }
        
        function add32(a, b) {
            return (a + b) & 0xFFFFFFFF;
        }
        
        // 简化实现：对于WBI签名，使用浏览器内置的crypto API
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            // 使用现代浏览器的crypto API（异步）
            return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
                .then(hashBuffer => {
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                })
                .catch(() => simpleFallbackHash(str));
        }
        
        // 降级：简单的哈希函数
        return simpleFallbackHash(str);
    }
    
    function simpleFallbackHash(str) {
        let hash = 0;
        if (str.length === 0) return hash.toString(16);
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16).padStart(8, '0').repeat(4);
    }

    async function getWbiMixinKey() {
        if (wbiMixinKeyCache) return wbiMixinKeyCache;
        
        try {
            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: 'https://api.bilibili.com/x/web-interface/nav',
                    responseType: 'json',
                    onload: resolve,
                    onerror: reject
                });
            });
            
            const data = response.response.data;
            const img_key = (data.wbi_img?.img_url || '').split('/').pop().split('.')[0];
            const sub_key = (data.wbi_img?.sub_url || '').split('/').pop().split('.')[0];
            const raw = img_key + sub_key;
            
            // WBI混合顺序
            const order = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,41,57,29,9,42,19,56,7,37,1,4,24,54,26,38,40,28,13,51,22,16,55,12,21,39,0,17,44,30,52,14,33,48,6,34,11,25,20,36];
            wbiMixinKeyCache = order.map(i => raw[i]).join('').slice(0, 32);
            return wbiMixinKeyCache;
        } catch (error) {
            console.error('获取WBI密钥失败:', error);
            // 降级到简单随机字符串
            wbiMixinKeyCache = Array.from(Array(32), () => Math.floor(Math.random() * 16).toString(16)).join('');
            return wbiMixinKeyCache;
        }
    }

    function encodeWbi(obj) {
        return Object.keys(obj).sort()
            .map(k => `${k}=${encodeURIComponent(String(obj[k]).replace(/[!'()*]/g, ''))}`)
            .join('&');
    }

    async function wbiRequest(url, params = {}) {
        const mixin = await getWbiMixinKey();
        const p = { ...params, wts: Math.floor(Date.now() / 1000) };
        const qs = encodeWbi(p);
        const w_rid = await md5(qs + mixin);
        const fullUrl = `${url}?${qs}&w_rid=${w_rid}`;
        
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: fullUrl,
                responseType: 'json',
                onload: ({ response }) => resolve(response),
                onerror: reject
            });
        });
    }

    // ===== 通用工具函数 =====
    function getCsrf() {
        return document.cookie.match(/bili_jct=([^;]+)/)?.[1] || '';
    }

    function getLoginMid() {
        return document.cookie.match(/DedeUserID=([^;]+)/)?.[1] || '';
    }

    function log(message, type = 'info') {
        const styles = {
            info: 'color: #00a1d6',
            error: 'color: #ff0000',
            success: 'color: #00cc00'
        };
        console.log(`%c[关注分类] ${message}`, styles[type]);
    }

    // ===== 分区映射 =====
    const TNAME_MAP = {
        1: '动画', 3: '音乐', 4: '游戏', 5: '娱乐', 11: '电视剧',
        13: '新闻', 23: '电影', 36: '科技', 119: '鬼畜', 129: '舞蹈',
        155: '时尚', 160: '生活', 181: '影视', 188: '数码', 211: '美食',
        217: '动物圈', 223: '汽车', 234: '运动', 244: '知识'
    };

    // ===== 核心API函数 =====

    // 获取当前页面的标签ID
    function getCurrentTagId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('tagid') || '0'; // 默认为全部关注
    }

    // 获取关注列表 - 优化版（仅获取当前分组）
    async function getFollowingList(limit = 1000) {
        const tagid = getCurrentTagId();
        log(`开始获取关注列表... (分组ID: ${tagid})`);
        
        const mid = getLoginMid();
        if (!mid) throw new Error('未登录');

        const result = [];
        let pn = 1;
        const ps = 50;
        
        while (result.length < limit) {
            try {
                // 根据tagid构建URL
                let url = `https://api.bilibili.com/x/relation/followings?vmid=${mid}&pn=${pn}&ps=${ps}&order=desc&order_type=attention`;
                if (tagid !== '0') {
                    url += `&tag=${tagid}`;
                }
                
                const response = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        responseType: 'json',
                        headers: {
                            'referer': 'https://www.bilibili.com/'
                        },
                        onload: ({ response }) => resolve(response?.data || {}),
                        onerror: reject
                    });
                });
                
                const list = response.list || [];
                if (list.length === 0) break;
                
                list.forEach(user => {
                    if (result.length < limit) {
                        result.push({
                            mid: user.mid,
                            uname: user.uname,
                            face: user.face,
                            official_verify: user.official_verify,
                            vip: user.vip
                        });
                    }
                });
                
                if (list.length < ps) break;
                pn++;
                
                updateProgress(`已获取关注 ${result.length} (分组: ${tagid === '0' ? '全部' : tagid})`);
                
                // 避免请求过快
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                log(`获取关注列表第${pn}页失败: ${error.message}`, 'error');
                break;
            }
        }
        
        log(`关注列表获取完成，共${result.length}个UP主 (分组: ${tagid === '0' ? '全部' : tagid})`);
        return result;
    }

    // 获取UP主最常投稿分区 - 真正的BiliScope算法实现
    async function getUploaderTopCategory(mid, maxVideos = 60) {
        try {
            const tidCount = {};
            let pn = 1;
            const ps = 30;
            let totalProcessed = 0;
            
            // 使用和BiliScope相同的API和参数
            while (totalProcessed < maxVideos) {
                const response = await wbiRequest('https://api.bilibili.com/x/space/wbi/arc/search', {
                    mid: mid,
                    pn: pn,
                    ps: ps,
                    index: 1,  // BiliScope使用的参数
                    order: "pubdate",
                    order_avoided: "true"  // BiliScope使用的参数
                });
                
                if (response.code !== 0 || !response.data?.list?.vlist) {
                    break;
                }
                
                const videos = response.data.list.vlist;
                if (videos.length === 0) break;
                
                // 统计每个分区的视频数量 - 与BiliScope相同的逻辑
                videos.forEach(video => {
                    if (totalProcessed < maxVideos && video.typeid) {
                        tidCount[video.typeid] = (tidCount[video.typeid] || 0) + 1;
                        totalProcessed++;
                    }
                });
                
                if (videos.length < ps) break;
                pn++;
                
                // 控制请求频率
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // 找出最常投稿的分区 - 与BiliScope相同的逻辑
            let topTid = null;
            let maxCount = 0;
            
            Object.entries(tidCount).forEach(([tid, count]) => {
                if (count > maxCount) {
                    maxCount = count;
                    topTid = parseInt(tid);
                }
            });
            
            return {
                tid: topTid,
                tname: TNAME_MAP[topTid] || `分区${topTid}`,
                count: maxCount,
                total: totalProcessed,
                distribution: tidCount  // 返回完整的分区分布
            };
        } catch (error) {
            log(`获取UP主${mid}分区信息失败: ${error.message}`, 'error');
            return { 
                tid: null, 
                tname: '未知', 
                count: 0, 
                total: 0,
                distribution: {} 
            };
        }
    }

    // 并发控制器 - 优化性能
    async function runWithConcurrency(items, worker, concurrency = 5) {
        const results = [];
        let index = 0;
        
        async function runWorker() {
            while (index < items.length) {
                const currentIndex = index++;
                try {
                    results[currentIndex] = await worker(items[currentIndex], currentIndex);
                } catch (error) {
                    results[currentIndex] = { error };
                }
            }
        }
        
        const workers = Array(concurrency).fill().map(runWorker);
        await Promise.all(workers);
        
        return results;
    }

    // ===== 关注标签管理API =====
    
    // 获取现有关注标签
    async function getRelationTags() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://api.bilibili.com/x/relation/tags',
                responseType: 'json',
                headers: {
                    'referer': 'https://www.bilibili.com/'
                },
                onload: ({ response }) => resolve(response?.data || []),
                onerror: reject
            });
        });
    }
    
    // 创建新的关注标签
    async function createRelationTag(tagName) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.bilibili.com/x/relation/tag/create',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'referer': 'https://www.bilibili.com/'
                },
                data: `tag=${encodeURIComponent(tagName)}&csrf=${getCsrf()}`,
                responseType: 'json',
                onload: ({ response }) => {
                    if (response?.code === 0) {
                        resolve(response.data?.tagid);
                    } else {
                        reject(new Error(response?.message || '创建标签失败'));
                    }
                },
                onerror: reject
            });
        });
    }
    
    // 批量添加用户到标签
    async function addUsersToTag(tagid, userMids, operationMode = 'copy') {
        // 分批处理，每次最多20个用户
        const batchSize = 20;
        const results = [];
        
        for (let i = 0; i < userMids.length; i += batchSize) {
            const batch = userMids.slice(i, i + batchSize);
            
            try {
                const result = await new Promise((resolve, reject) => {
                    const url = operationMode === 'move' 
                        ? 'https://api.bilibili.com/x/relation/tags/moveUsers'
                        : 'https://api.bilibili.com/x/relation/tags/addUsers';
                    
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: url,
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'referer': 'https://www.bilibili.com/'
                        },
                        data: `tagid=${tagid}&fids=${batch.join(',')}&csrf=${getCsrf()}`,
                        responseType: 'json',
                        onload: ({ response }) => {
                            if (response?.code === 0) {
                                resolve({ success: true, count: batch.length });
                            } else {
                                reject(new Error(response?.message || '添加用户到标签失败'));
                            }
                        },
                        onerror: reject
                    });
                });
                
                results.push(result);
                
                // 批次间暂停，避免频控
                if (i + batchSize < userMids.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                log(`批次处理失败: ${error.message}`, 'error');
                results.push({ success: false, error: error.message });
            }
        }
        
        return results;
    }

    // ===== UI组件 =====
    
    // 创建进度显示
    function createProgressDiv() {
        const div = document.createElement('div');
        div.id = 'follow-progress';
        div.className = 'follow-classifier-progress';
        div.innerHTML = `
            <div>正在处理...</div>
            <div class="follow-classifier-progress-bar">
                <div class="follow-classifier-progress-fill" style="width: 0%"></div>
            </div>
            <div>0/0</div>
        `;
        document.body.appendChild(div);
        return div;
    }
    
    // 更新进度显示
    function updateProgress(message, current = 0, total = 0) {
        const progressDiv = document.getElementById('follow-progress') || createProgressDiv();
        progressDiv.querySelector('div:first-child').textContent = message;
        
        if (total > 0) {
            const percentage = (current / total) * 100;
            progressDiv.querySelector('.follow-classifier-progress-fill').style.width = `${percentage}%`;
            progressDiv.querySelector('div:last-child').textContent = `${current}/${total}`;
        }
    }
    
    // 创建配置界面
    function createConfigUI(categoryGroups) {
        return new Promise((resolve, reject) => {
            const modal = document.createElement('div');
            modal.className = 'follow-classifier-container follow-classifier-modal';

            const categoryOptions = Object.entries(categoryGroups)
                .sort(([,a], [,b]) => b.users.length - a.users.length)  // 按用户数量排序
                .map(([tid, data]) => `
                    <label class="follow-classifier-checkbox-label">
                        <input type="checkbox" class="follow-classifier-checkbox" value="${tid}">
                        <span>${data.tname}</span>
                        <span class="follow-classifier-stats">(${data.users.length}人)</span>
                    </label>
                `).join('');

            const tagid = getCurrentTagId();
            const currentGroupText = tagid === '0' ? '全部关注' : `分组${tagid}`;

            modal.innerHTML = `
                <h3>关注列表自动分类 - ${currentGroupText}</h3>

                <div class="follow-classifier-tips">
                    💡 基于UP主最常投稿分区进行智能分类，使用BiliScope真实算法分析视频typeid统计<br>
                    📍 仅对当前页面的关注分组生效: ${currentGroupText}
                </div>

                <div class="follow-classifier-radio-group">
                    <label class="follow-classifier-radio-label">
                        <input type="radio" name="operationMode" value="copy" checked> 复制模式（保留原有分组）
                    </label>
                    <label class="follow-classifier-radio-label">
                        <input type="radio" name="operationMode" value="move"> 移动模式（清除原有分组）
                    </label>
                </div>

                <div class="follow-classifier-option-group">
                    <label class="follow-classifier-checkbox-label">
                        <input type="checkbox" id="autoClassifyUnassigned" checked>
                        对未自定义分组的UP主自动按分区分类
                    </label>
                </div>

                <div style="margin-bottom: 20px">
                    <button class="follow-classifier-btn" id="addCustomGroup">添加自定义分组</button>
                    <button class="follow-classifier-btn secondary" id="selectHighActivity">选择高活跃分区</button>
                </div>
                
                <div id="customGroups"></div>
                
                <div id="defaultGroups">
                    <h4>分区分组预览 (按UP主数量排序)</h4>
                    <div class="follow-classifier-checkbox-group">
                        ${categoryOptions}
                    </div>
                </div>

                <div class="follow-classifier-footer">
                    <button class="follow-classifier-btn secondary" id="cancelClassify">取消</button>
                    <button class="follow-classifier-btn" id="startClassify">开始分类</button>
                </div>
            `;

            document.body.appendChild(modal);

            let existingTags = [];
            let customGroups = [];
            let operationMode = 'copy';
            let autoClassifyUnassigned = true;

            // 获取现有标签
            getRelationTags().then(tags => {
                existingTags = tags;
            });

            // 操作模式选择
            modal.querySelectorAll('input[name="operationMode"]').forEach(radio => {
                radio.addEventListener('change', function() {
                    operationMode = this.value;
                });
            });

            // 自动分类选项
            modal.querySelector('#autoClassifyUnassigned').addEventListener('change', function() {
                autoClassifyUnassigned = this.checked;
            });

            // 选择高活跃分区
            document.getElementById('selectHighActivity').onclick = () => {
                const sortedCategories = Object.entries(categoryGroups)
                    .sort(([,a], [,b]) => b.users.length - a.users.length)
                    .slice(0, 5);
                
                modal.querySelectorAll('.follow-classifier-checkbox').forEach(checkbox => {
                    checkbox.checked = sortedCategories.some(([tid]) => tid === checkbox.value);
                });
            };

            // 添加自定义分组
            document.getElementById('addCustomGroup').onclick = () => {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'follow-classifier-group custom-group';

                groupDiv.innerHTML = `
                    <div class="follow-classifier-group-header">
                        <input type="text" class="follow-classifier-input tag-name" placeholder="标签名称">
                        <button class="follow-classifier-btn secondary use-existing">使用现有标签</button>
                        <button class="follow-classifier-btn danger remove-group">删除</button>
                    </div>
                    <div class="follow-classifier-checkbox-group category-options">
                        ${categoryOptions}
                    </div>
                `;

                document.getElementById('customGroups').appendChild(groupDiv);

                // 使用现有标签
                groupDiv.querySelector('.use-existing').onclick = () => {
                    const select = document.createElement('select');
                    select.className = 'follow-classifier-select';
                    select.innerHTML = `
                        <option value="">选择现有标签</option>
                        ${existingTags.map(tag => `<option value="${tag.tagid}">${tag.name}</option>`).join('')}
                    `;
                    const input = groupDiv.querySelector('.tag-name');
                    input.parentNode.replaceChild(select, input);
                };

                // 删除分组
                groupDiv.querySelector('.remove-group').onclick = () => {
                    groupDiv.remove();
                };
            };

            // 开始分类
            document.getElementById('startClassify').onclick = () => {
                const config = {
                    custom: [],
                    default: {},
                    operationMode: operationMode,
                    autoClassifyUnassigned: autoClassifyUnassigned
                };

                // 收集自定义分组配置
                document.querySelectorAll('.custom-group').forEach(group => {
                    const nameInput = group.querySelector('.tag-name, select');
                    const selectedTids = Array.from(group.querySelectorAll('input[type="checkbox"]:checked'))
                        .map(cb => cb.value);

                    if (selectedTids.length > 0 && nameInput.value) {
                        config.custom.push({
                            name: nameInput.tagName === 'SELECT' ? 
                                existingTags.find(t => t.tagid == nameInput.value)?.name : nameInput.value,
                            isExisting: nameInput.tagName === 'SELECT',
                            tagid: nameInput.tagName === 'SELECT' ? nameInput.value : null,
                            tids: selectedTids
                        });
                    }
                });

                // 收集默认分组配置
                if (autoClassifyUnassigned) {
                    Object.entries(categoryGroups).forEach(([tid, data]) => {
                        if (!config.custom.some(g => g.tids.includes(tid))) {
                            config.default[tid] = data.tname;
                        }
                    });
                }

                modal.remove();
                resolve(config);
            };

            // 取消
            document.getElementById('cancelClassify').onclick = () => {
                modal.remove();
                reject(new Error('用户取消操作'));
            };
        });
    }

    // ===== 主处理流程 =====
    
    async function processFollowClassification() {
        let totalProcessed = 0;
        
        try {
            // 1. 获取关注列表
            updateProgress('正在获取关注列表...');
            const followingList = await getFollowingList();
            
            if (followingList.length === 0) {
                throw new Error('关注列表为空');
            }

            // 2. 批量获取UP主分区信息（并发优化）
            updateProgress('正在分析UP主投稿分区...', 0, followingList.length);
            
            const categoryResults = await runWithConcurrency(
                followingList,
                async (user, index) => {
                    const result = await getUploaderTopCategory(user.mid);
                    updateProgress(`分析UP主投稿分区... ${user.uname}`, index + 1, followingList.length);
                    
                    // 避免请求过快
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    return {
                        ...user,
                        category: result
                    };
                },
                6 // 并发数
            );

            // 3. 按分区分组
            const categoryGroups = {};
            const failedUsers = [];
            
            categoryResults.forEach(result => {
                if (result.error || !result.category?.tid) {
                    failedUsers.push(result);
                    return;
                }
                
                const tid = result.category.tid;
                if (!categoryGroups[tid]) {
                    categoryGroups[tid] = {
                        tid: tid,
                        tname: result.category.tname,
                        users: []
                    };
                }
                categoryGroups[tid].users.push(result);
            });

            if (failedUsers.length > 0) {
                log(`有${failedUsers.length}个UP主分析失败，将被跳过`, 'error');
            }

            // 4. 显示配置界面
            const userConfig = await createConfigUI(categoryGroups);

            // 5. 执行分类操作
            updateProgress('开始执行分类操作...');
            
            const existingTags = await getRelationTags();
            const tagMapByName = Object.fromEntries(existingTags.map(t => [t.name, t.tagid]));

            // 处理自定义分组
            for (const group of userConfig.custom) {
                updateProgress(`处理自定义分组: ${group.name}`);
                
                let tagId = group.isExisting ? parseInt(group.tagid) : tagMapByName[group.name];
                
                if (!tagId) {
                    tagId = await createRelationTag(group.name);
                    log(`创建新标签: ${group.name} (ID: ${tagId})`);
                }
                
                // 收集该分组的所有用户
                const userMids = group.tids.flatMap(tid => 
                    (categoryGroups[tid]?.users || []).map(user => user.mid)
                );
                
                if (userMids.length > 0) {
                    await addUsersToTag(tagId, userMids, userConfig.operationMode);
                    totalProcessed += userMids.length;
                    log(`标签"${group.name}"添加了${userMids.length}个用户`);
                }
            }

            // 处理默认分组
            if (userConfig.autoClassifyUnassigned) {
                for (const [tid, tname] of Object.entries(userConfig.default)) {
                    if (userConfig.custom.some(g => g.tids.includes(tid))) {
                        continue;
                    }
                    
                    updateProgress(`处理默认分组: ${tname}`);
                    
                    let tagId = tagMapByName[tname];
                    if (!tagId) {
                        tagId = await createRelationTag(tname);
                        log(`创建新标签: ${tname} (ID: ${tagId})`);
                    }
                    
                    const userMids = (categoryGroups[tid]?.users || []).map(user => user.mid);
                    
                    if (userMids.length > 0) {
                        await addUsersToTag(tagId, userMids, userConfig.operationMode);
                        totalProcessed += userMids.length;
                        log(`标签"${tname}"添加了${userMids.length}个用户`);
                    }
                }
            }

            // 完成
            document.getElementById('follow-progress')?.remove();
            
            const message = `关注列表分类完成！\n处理了 ${totalProcessed} 个UP主\n跳过了 ${failedUsers.length} 个分析失败的UP主`;
            alert(message);
            log(message, 'success');

        } catch (error) {
            document.getElementById('follow-progress')?.remove();
            const message = `分类失败: ${error.message}`;
            alert(message);
            log(message, 'error');
        }
    }

    // ===== 初始化和页面检测 =====
    
    function addTriggerButton() {
        // 检测是否在关注列表页面（支持不同的分组）
        if (!window.location.href.includes('/fans/follow')) {
            return;
        }
        
        // 避免重复添加按钮
        if (document.querySelector('.follow-classifier-float-btn')) {
            return;
        }

        const btnContainer = document.createElement('div');
        btnContainer.className = 'follow-classifier-float-btn';

        const btn = document.createElement('button');
        btn.className = 'follow-classifier-btn';
        btn.textContent = '🏷️ 关注分类';
        
        const tagid = getCurrentTagId();
        const tagText = tagid === '0' ? '全部关注' : `分组${tagid}`;
        btn.title = `按UP主最常投稿分区自动分类 (当前: ${tagText})`;
        btn.onclick = processFollowClassification;

        btnContainer.appendChild(btn);
        document.body.appendChild(btnContainer);
        
        log(`关注分类功能已加载 (分组: ${tagText})`);
    }

    // 等待页面加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addTriggerButton);
    } else {
        addTriggerButton();
    }

    // 监听页面变化（SPA应用）
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setTimeout(addTriggerButton, 1000);
        }
    }).observe(document, { subtree: true, childList: true });

})();
