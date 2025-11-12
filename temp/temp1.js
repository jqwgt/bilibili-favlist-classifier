// ==UserScript==
// @name         B站关注列表自动分类器（智能分组版）
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  B站关注列表按UP主最常投稿分区智能分类分组 - 全新配置界面、自定义分组、现有分组复用、分页修复
// @author       https://space.bilibili.com/1937042029,https://github.com/jqwgt
// @license      GPL-3.0-or-later
// @match        *://space.bilibili.com/*/relation/follow*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.bilibili.com
// @connect      space.bilibili.com
// @updateURL    https://github.com/jqwgt
// ==/UserScript==

(function() {
    'use strict';

    // ===== 全局状态管理 =====
    let isPaused = false;
    let isProcessing = false;
    let maxProcessCount = 50; // 默认处理数量
    let videosPerUser = 15; // 每个UP主分析的视频数量
    let currentProgress = { processed: 0, total: 0, results: [] };
    let processedUsers = []; // 已处理的用户列表
    let currentPanel = null;
    let followGroups = []; // 关注分组列表

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
        .follow-classifier-float-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
        }
        .follow-classifier-btn {
            padding: 10px 16px;
            background: #00a1d6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 2px 10px rgba(0, 161, 214, 0.3);
            transition: all 0.3s ease;
        }
        .follow-classifier-btn:hover {
            background: #0080b3;
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(0, 161, 214, 0.4);
        }
        .progress-circle {
            width: 20px;
            height: 20px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #00a1d6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            display: inline-block;
            margin-right: 8px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `);

    // ===== MD5加密实现 =====
    function md5(str) {
        function md5cycle(x, k) {
            let a = x[0], b = x[1], c = x[2], d = x[3];
            a = ff(a, b, c, d, k[0], 7, -680876936);
            d = ff(d, a, b, c, k[1], 12, -389564586);
            c = ff(c, d, a, b, k[2], 17, 606105819);
            b = ff(b, c, d, a, k[3], 22, -1044525330);
            a = ff(a, b, c, d, k[4], 7, -176418897);
            d = ff(d, a, b, c, k[5], 12, 1200080426);
            c = ff(c, d, a, b, k[6], 17, -1473231341);
            b = ff(b, c, d, a, k[7], 22, -45705983);
            a = ff(a, b, c, d, k[8], 7, 1770035416);
            d = ff(d, a, b, c, k[9], 12, -1958414417);
            c = ff(c, d, a, b, k[10], 17, -42063);
            b = ff(b, c, d, a, k[11], 22, -1990404162);
            a = ff(a, b, c, d, k[12], 7, 1804603682);
            d = ff(d, a, b, c, k[13], 12, -40341101);
            c = ff(c, d, a, b, k[14], 17, -1502002290);
            b = ff(b, c, d, a, k[15], 22, 1236535329);
            a = gg(a, b, c, d, k[1], 5, -165796510);
            d = gg(d, a, b, c, k[6], 9, -1069501632);
            c = gg(c, d, a, b, k[11], 14, 643717713);
            b = gg(b, c, d, a, k[0], 20, -373897302);
            a = gg(a, b, c, d, k[5], 5, -701558691);
            d = gg(d, a, b, c, k[10], 9, 38016083);
            c = gg(c, d, a, b, k[15], 14, -660478335);
            b = gg(b, c, d, a, k[4], 20, -405537848);
            a = gg(a, b, c, d, k[9], 5, 568446438);
            d = gg(d, a, b, c, k[14], 9, -1019803690);
            c = gg(c, d, a, b, k[3], 14, -187363961);
            b = gg(b, c, d, a, k[8], 20, 1163531501);
            a = gg(a, b, c, d, k[13], 5, -1444681467);
            d = gg(d, a, b, c, k[2], 9, -51403784);
            c = gg(c, d, a, b, k[7], 14, 1735328473);
            b = gg(b, c, d, a, k[12], 20, -1926607734);
            a = hh(a, b, c, d, k[5], 4, -378558);
            d = hh(d, a, b, c, k[8], 11, -2022574463);
            c = hh(c, d, a, b, k[11], 16, 1839030562);
            b = hh(b, c, d, a, k[14], 23, -35309556);
            a = hh(a, b, c, d, k[1], 4, -1530992060);
            d = hh(d, a, b, c, k[4], 11, 1272893353);
            c = hh(c, d, a, b, k[7], 16, -155497632);
            b = hh(b, c, d, a, k[10], 23, -1094730640);
            a = hh(a, b, c, d, k[13], 4, 681279174);
            d = hh(d, a, b, c, k[0], 11, -358537222);
            c = hh(c, d, a, b, k[3], 16, -722521979);
            b = hh(b, c, d, a, k[6], 23, 76029189);
            a = hh(a, b, c, d, k[9], 4, -640364487);
            d = hh(d, a, b, c, k[12], 11, -421815835);
            c = hh(c, d, a, b, k[15], 16, 530742520);
            b = hh(b, c, d, a, k[2], 23, -995338651);
            a = ii(a, b, c, d, k[0], 6, -198630844);
            d = ii(d, a, b, c, k[7], 10, 1126891415);
            c = ii(c, d, a, b, k[14], 15, -1416354905);
            b = ii(b, c, d, a, k[5], 21, -57434055);
            a = ii(a, b, c, d, k[12], 6, 1700485571);
            d = ii(d, a, b, c, k[3], 10, -1894986606);
            c = ii(c, d, a, b, k[10], 15, -1051523);
            b = ii(b, c, d, a, k[1], 21, -2054922799);
            a = ii(a, b, c, d, k[8], 6, 1873313359);
            d = ii(d, a, b, c, k[15], 10, -30611744);
            c = ii(c, d, a, b, k[6], 15, -1560198380);
            b = ii(b, c, d, a, k[13], 21, 1309151649);
            a = ii(a, b, c, d, k[4], 6, -145523070);
            d = ii(d, a, b, c, k[11], 10, -1120210379);
            c = ii(c, d, a, b, k[2], 15, 718787259);
            b = ii(b, c, d, a, k[9], 21, -343485551);
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

        function gg(a, b, c, d, x, s, t) {
            return cmn((b & d) | (c & (~d)), a, b, x, s, t);
        }

        function hh(a, b, c, d, x, s, t) {
            return cmn(b ^ c ^ d, a, b, x, s, t);
        }

        function ii(a, b, c, d, x, s, t) {
            return cmn(c ^ (b | (~d)), a, b, x, s, t);
        }

        function md51(s) {
            let n = s.length;
            let state = [1732584193, -271733879, -1732584194, 271733878];
            let i;
            for (i = 64; i <= s.length; i += 64) {
                md5cycle(state, md5blk(s.substring(i - 64, i)));
            }
            s = s.substring(i - 64);
            let tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            for (i = 0; i < s.length; i++)
                tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
            tail[i >> 2] |= 0x80 << ((i % 4) << 3);
            if (i > 55) {
                md5cycle(state, tail);
                for (i = 0; i < 16; i++) tail[i] = 0;
            }
            tail[14] = n * 8;
            md5cycle(state, tail);
            return state;
        }

        function md5blk(s) {
            let md5blks = [];
            for (let i = 0; i < 64; i += 4) {
                md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
            }
            return md5blks;
        }

        function rhex(n) {
            let s = "";
            for (let j = 0; j < 4; j++)
                s += hex(n >> (j * 8));
            return s;
        }

        function hex(x) {
            return "0123456789abcdef".charAt((x >> 4) & 0x0F) + "0123456789abcdef".charAt(x & 0x0F);
        }

        function add32(a, b) {
            return (a + b) & 0xFFFFFFFF;
        }

        return md51(str).map(rhex).join('');
    }

    // ===== WBI签名系统 =====
    async function getWbiMixinKey() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://api.bilibili.com/x/web-interface/nav',
                headers: {
                    'User-Agent': navigator.userAgent,
                    'Referer': 'https://space.bilibili.com/',
                    'Origin': 'https://space.bilibili.com',
                    'Cookie': document.cookie,
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-site'
                },
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.code === 0 && data.data.wbi_img) {
                            const imgUrl = data.data.wbi_img.img_url;
                            const subUrl = data.data.wbi_img.sub_url;
                            const imgKey = imgUrl.split('/').pop().split('.')[0];
                            const subKey = subUrl.split('/').pop().split('.')[0];
                            
                            // BiliScope真实混淆算法
                            const mixinKeyEncTab = [
                                46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
                                33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
                                61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
                                36, 20, 34, 44, 52
                            ];
                            
                            const rawWbiKey = imgKey + subKey;
                            let mixinKey = '';
                            mixinKeyEncTab.forEach(i => {
                                if (i < rawWbiKey.length) {
                                    mixinKey += rawWbiKey[i];
                                }
                            });
                            
                            resolve(mixinKey.slice(0, 32));
                        } else {
                            reject(new Error('获取WBI Key失败'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: function(error) {
                    reject(error);
                }
            });
        });
    }

    function encodeWbi(obj) {
        const params = new URLSearchParams();
        Object.keys(obj).sort().forEach(key => {
            if (obj[key] !== undefined && obj[key] !== null) {
                params.append(key, String(obj[key]));
            }
        });
        return params.toString();
    }

    // ===== 增强的HTTP请求函数 =====
    async function enhancedRequest(url, params = {}, options = {}) {
        const mixinKey = await getWbiMixinKey();
        
        // 添加时间戳
        params.wts = Math.floor(Date.now() / 1000);
        
        // 生成签名
        const query = encodeWbi(params);
        const wbiSign = md5(query + mixinKey);
        
        const method = options.method || 'GET';
        let finalUrl = url;
        let requestBody = null;
        
        if (method === 'GET') {
            finalUrl = `${url}?${query}&w_rid=${wbiSign}`;
        } else {
            // POST请求
            requestBody = `${query}&w_rid=${wbiSign}`;
        }
        
        return new Promise((resolve, reject) => {
            // 增强的Headers - 基于GitHub issue #872的解决方案
            const enhancedHeaders = {
                'User-Agent': navigator.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': window.location.origin + '/relation/follow',
                'Origin': window.location.origin,
                'Cookie': document.cookie,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-site',
                'X-Requested-With': 'XMLHttpRequest',
                ...options.headers
            };
            
            // POST请求需要额外的headers
            if (method === 'POST') {
                enhancedHeaders['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
            }

            GM_xmlhttpRequest({
                method: method,
                url: finalUrl,
                headers: enhancedHeaders,
                data: requestBody,
                timeout: options.timeout || 30000,
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        resolve(data);
                    } catch (error) {
                        reject(new Error(`解析响应失败: ${error.message}`));
                    }
                },
                onerror: function(error) {
                    reject(new Error(`请求失败: ${error.message || 'Network error'}`));
                },
                ontimeout: function() {
                    reject(new Error('请求超时'));
                }
            });
        });
    }

    // ===== 分区映射表 (完整版) =====
    const TNAME_MAP = {
        "1": "动画", "24": "MAD·AMV", "25": "MMD·3D", "47": "短片·手书·配音", "27": "综合",
        "3": "音乐", "28": "原创音乐", "31": "翻唱", "30": "VOCALOID·UTAU", "194": "电音", "29": "音乐现场", "130": "音乐综合",
        "129": "舞蹈", "20": "宅舞", "198": "街舞", "199": "明星舞蹈", "200": "中国舞", "154": "舞蹈综合", "156": "舞蹈教程",
        "4": "游戏", "17": "单机游戏", "171": "电子竞技", "172": "手机游戏", "65": "网络游戏", "173": "桌游棋牌", "121": "GMV", "136": "音游", "19": "Mugen",
        "36": "知识", "201": "科学科普", "124": "社科·法律·心理", "228": "人文历史", "207": "财经商业", "208": "校园学习", "209": "职业职场", "229": "设计·创意", "122": "野生技能协会",
        "188": "科技", "95": "数码", "230": "计算机技术", "231": "工程·产品·设计", "232": "人工智能",
        "234": "运动", "235": "篮球·足球", "249": "健身", "164": "运动文化", "236": "运动综合",
        "223": "汽车", "245": "汽车生活", "246": "汽车文化", "247": "汽车极客", "248": "摩托车",
        "160": "生活", "138": "搞笑", "21": "日常", "161": "手工", "162": "绘画", "163": "摄影摄像", "174": "萌宠", "175": "动物圈", "239": "美食圈", "252": "亲子", "253": "家居房产",
        "119": "鬼畜", "22": "鬼畜调教", "26": "音MAD", "126": "人力VOCALOID", "216": "鬼畜剧场",
        "155": "时尚", "157": "美妆护肤", "158": "仿妆cos", "159": "穿搭", "192": "风尚标",
        "5": "娱乐", "71": "综艺", "241": "娱乐杂谈", "242": "粉丝创作", "137": "明星综合",
        "181": "影视", "182": "影视杂谈", "183": "影视剪辑", "85": "短片", "184": "预告·资讯",
        "177": "纪录片", "37": "人文·历史", "178": "科学·探索·自然", "179": "军事", "180": "社会·美食·旅行",
        "23": "电影", "147": "华语电影", "145": "欧美电影", "146": "日本电影", "83": "其他国家",
        "11": "电视剧", "185": "国产剧", "187": "海外剧",
        "13": "番剧", "167": "连载动画", "169": "完结动画", "170": "官方延伸",
        "168": "国创", "195": "国产动画",
        "202": "美食", "203": "美食制作", "204": "美食侦探", "205": "美食测评", "206": "田园美食",
        "211": "动物圈", "212": "喵星人", "213": "汪星人", "214": "大熊猫", "215": "野生动物", "217": "爬宠", "218": "动物综合",
        "76": "VLOG", "250": "日常", "251": "出行", "240": "校园", "254": "家庭", "255": "体验",
        "221": "COSPLAY", "222": "COSPLAY",
        "75": "动物圈", "176": "汽车文化", "256": "职业职场", "265": "人工智能"
    };

    // ===== 关注分组API =====
    
    // 获取关注分组列表
    async function getFollowGroups() {
        try {
            const data = await enhancedRequest('https://api.bilibili.com/x/relation/tags', {});
            
            if (data.code !== 0) {
                throw new Error(`获取关注分组失败: ${data.code} ${data.message || ''}`);
            }
            
            followGroups = data.data || [];
            return followGroups;
        } catch (error) {
            log(`获取关注分组失败: ${error.message}`, 'error');
            throw error;
        }
    }
    
    // 创建关注分组
    async function createFollowGroup(groupName) {
        try {
            const data = await enhancedRequest('https://api.bilibili.com/x/relation/tag/create', {
                tag: groupName
            }, { method: 'POST' });
            
            if (data.code !== 0) {
                throw new Error(`创建分组失败: ${data.code} ${data.message || ''}`);
            }
            
            log(`成功创建分组: ${groupName}`, 'success');
            return data.data;
        } catch (error) {
            log(`创建分组失败: ${error.message}`, 'error');
            throw error;
        }
    }
    
    // 将用户添加到分组
    async function addUserToGroup(mids, tagId) {
        try {
            const data = await enhancedRequest('https://api.bilibili.com/x/relation/tags/addUsers', {
                fids: Array.isArray(mids) ? mids.join(',') : mids,
                tagids: tagId
            }, { method: 'POST' });
            
            if (data.code !== 0) {
                throw new Error(`添加到分组失败: ${data.code} ${data.message || ''}`);
            }
            
            log(`成功添加 ${Array.isArray(mids) ? mids.length : 1} 个用户到分组`, 'success');
            return data.data;
        } catch (error) {
            log(`添加到分组失败: ${error.message}`, 'error');
            throw error;
        }
    }
    
    // 获取或创建分组
    async function getOrCreateGroup(groupName) {
        await getFollowGroups();
        
        // 查找已存在的分组
        let existingGroup = followGroups.find(group => group.name === groupName);
        if (existingGroup) {
            return existingGroup.tagid;
        }
        
        // 创建新分组
        const newGroup = await createFollowGroup(groupName);
        return newGroup.tagid;
    }

    // ===== 控制面板创建 =====
    function createControlPanel() {
        if (currentPanel) {
            currentPanel.remove();
        }

        const panel = document.createElement('div');
        panel.id = 'bilibili-classifier-panel';
        panel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 400px;
            background: white;
            border: 2px solid #00a1d6;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            color: #333;
            backdrop-filter: blur(10px);
        `;
        
        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <div style="font-weight: bold; color: #00a1d6; font-size: 16px;">
                    🏷️ B站关注列表自动分类
                </div>
                <button id="close-panel" style="
                    background: none;
                    border: none;
                    font-size: 18px;
                    cursor: pointer;
                    color: #999;
                    padding: 4px;
                    border-radius: 4px;
                ">✕</button>
            </div>
            
            <!-- 数量控制 -->
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #666; font-weight: 500;">
                    本次处理数量限制：
                </label>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input id="process-count" type="number" value="50" min="1" max="999" 
                        style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px;">
                    <span style="font-size: 12px; color: #666;">个UP主</span>
                </div>
            </div>
            
            <!-- 视频数量配置 -->
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #666; font-weight: 500;">
                    每个UP主分析视频数量：
                </label>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input id="videos-per-user" type="number" value="15" min="5" max="50" 
                        style="flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px;">
                    <span style="font-size: 12px; color: #666;">个视频</span>
                </div>
                <div style="font-size: 11px; color: #999; margin-top: 4px;">
                    💡 建议5-20个视频，数量越多准确性越高但速度越慢
                </div>
            </div>
            
            <!-- 分组模式配置 -->
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #666; font-weight: 500;">
                    智能分组模式：
                </label>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <label style="display: flex; align-items: center; font-size: 12px;">
                        <input type="radio" name="group-mode" value="preview" checked style="margin-right: 6px;">
                        仅预览 - 不进行实际分组操作
                    </label>
                    <label style="display: flex; align-items: center; font-size: 12px;">
                        <input type="radio" name="group-mode" value="copy" style="margin-right: 6px;">
                        复制模式 - 复制UP主到新分组（保留原关注）
                    </label>
                    <label style="display: flex; align-items: center; font-size: 12px;">
                        <input type="radio" name="group-mode" value="move" style="margin-right: 6px;">
                        移动模式 - 移动UP主到新分组
                    </label>
                </div>
                <div style="font-size: 11px; color: #999; margin-top: 4px;">
                    💡 复制模式更安全，出错时不会丢失关注
                </div>
            </div>
            
            <!-- 分组策略配置 -->
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #666; font-weight: 500;">
                    分组策略：
                </label>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="display: flex; align-items: center; font-size: 12px;">
                        <input type="radio" name="group-strategy" value="create" checked style="margin-right: 6px;">
                        总是创建新分组
                    </label>
                    <label style="display: flex; align-items: center; font-size: 12px;">
                        <input type="radio" name="group-strategy" value="reuse" style="margin-right: 6px;">
                        复用已存在的同名分组
                    </label>
                </div>
                <div style="font-size: 11px; color: #999; margin-top: 4px;">
                    💡 复用模式会将UP主添加到已存在的分组中
                </div>
            </div>
            
            <div id="progress-info" style="margin-bottom: 12px; color: #666; font-size: 13px;">
                点击开始分析关注列表
            </div>
            <div id="progress-bar" style="width: 100%; height: 8px; background: #f0f0f0; border-radius: 4px; margin-bottom: 16px; overflow: hidden;">
                <div id="progress-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #00a1d6, #00d4aa); transition: width 0.3s;"></div>
            </div>
            
            <!-- 控制按钮 -->
            <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                <button id="start-classify-btn" style="
                    flex: 1;
                    padding: 12px;
                    background: linear-gradient(135deg, #00a1d6, #00d4aa);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                    transition: all 0.3s;
                ">开始分析</button>
                <button id="pause-classify-btn" style="
                    flex: 1;
                    padding: 12px;
                    background: #ff6b6b;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                    display: none;
                    transition: all 0.3s;
                ">暂停</button>
            </div>
            
            <!-- 结果操作 -->
            <div id="action-buttons" style="display: none;">
                <button id="apply-results-btn" style="
                    width: 100%;
                    padding: 10px;
                    background: #28a745;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    margin-bottom: 8px;
                    transition: all 0.3s;
                ">🏷️ 应用智能分组</button>
                
                <button id="export-results-btn" style="
                    width: 100%;
                    padding: 8px;
                    background: #17a2b8;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.3s;
                ">📊 查看数据表格</button>
            </div>
            
            <div id="results-container" style="max-height: 200px; overflow-y: auto; margin-top: 12px;"></div>
        `;
        
        document.body.appendChild(panel);
        currentPanel = panel;

        // 绑定事件
        document.getElementById('close-panel').onclick = () => panel.remove();
        document.getElementById('start-classify-btn').onclick = startClassification;
        document.getElementById('pause-classify-btn').onclick = pauseClassification;
        document.getElementById('apply-results-btn').onclick = applyResults;
        document.getElementById('export-results-btn').onclick = exportResults;
        document.getElementById('process-count').onchange = (e) => {
            maxProcessCount = parseInt(e.target.value) || 50;
        };
        document.getElementById('videos-per-user').onchange = (e) => {
            videosPerUser = parseInt(e.target.value) || 15;
        };

        return panel;
    }

    // ===== 进度更新函数 =====
    function updateProgress(message, progress = null) {
        const progressInfo = document.getElementById('progress-info');
        const progressFill = document.getElementById('progress-fill');
        
        if (progressInfo) {
            progressInfo.textContent = message;
        }
        
        if (progress !== null && progressFill) {
            progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        }
    }

    // ===== 分析UP主主要分区 =====
    async function analyzeUserCategory(mid, uname) {
        try {
            log(`[关注分类] 分析UP主 ${mid} (${uname})`);
            
            // 方法1：尝试使用UP主统计信息API
            try {
                log(`[调试] 尝试统计API: https://api.bilibili.com/x/space/upstat?mid=${mid}`);
                
                const statData = await enhancedRequest('https://api.bilibili.com/x/space/upstat', {
                    mid: mid
                });

                log(`[调试] 统计API响应: code=${statData.code}, message=${statData.message || 'none'}`);
                
                if (statData.code === 0 && statData.data?.archive?.tlist) {
                    const tlist = statData.data.archive.tlist;
                    log(`[调试] 找到分区统计: ${JSON.stringify(Object.keys(tlist))}`);
                    
                    // 找出投稿最多的分区
                    let maxCount = 0;
                    let mainTid = null;
                    
                    for (const [tid, info] of Object.entries(tlist)) {
                        const count = info.count || 0;
                        log(`[调试] 分区${tid}(${info.name}): ${count}个视频`);
                        if (count > maxCount) {
                            maxCount = count;
                            mainTid = tid;
                        }
                    }
                    
                    if (mainTid && maxCount > 0) {
                        const tname = tlist[mainTid].name || TNAME_MAP[mainTid] || `分区${mainTid}`;
                        log(`[关注分类] UP主 ${mid} 主要分区(统计API): ${tname} (${maxCount}个视频)`);
                        
                        return {
                            tid: mainTid,
                            tname: tname,
                            videoCount: Object.values(tlist).reduce((sum, t) => sum + (t.count || 0), 0),
                            mainCount: maxCount,
                            method: 'upstat'
                        };
                    }
                }
            } catch (statError) {
                log(`[关注分类] UP主 ${mid} 统计API异常: ${statError.message}`);
            }

            // 方法2：使用视频搜索API（优化版，优先使用tlist数据）
            log(`[调试] 使用搜索API获取分区统计`);
            
            const data = await enhancedRequest('https://api.bilibili.com/x/space/wbi/arc/search', {
                mid: mid,
                ps: videosPerUser,
                tid: 0,
                pn: 1,
                keyword: '',
                order: 'pubdate'
            });

            log(`[调试] 搜索API响应: code=${data.code}, message=${data.message || 'none'}`);

            if (data.code === -412) {
                throw new Error('请求被拦截(-412)，需要更完整的认证信息');
            }

            if (data.code === -799) {
                // 频率限制，等待后重试
                log(`[关注分类] UP主 ${mid} 触发频率限制，等待重试`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return await analyzeUserCategory(mid, uname);
            }

            if (data.code !== 0) {
                throw new Error(`API返回错误: ${data.code} ${data.message || ''}`);
            }

            // 优先使用tlist数据（更准确的分区统计）
            if (data.data?.list?.tlist && Object.keys(data.data.list.tlist).length > 0) {
                const tlist = data.data.list.tlist;
                log(`[调试] 使用搜索API的tlist数据: ${JSON.stringify(Object.keys(tlist))}`);
                
                // 找出投稿最多的分区
                let maxCount = 0;
                let mainTid = null;
                
                for (const [tid, info] of Object.entries(tlist)) {
                    const count = info.count || 0;
                    log(`[调试] 分区${tid}(${info.name}): ${count}个视频`);
                    if (count > maxCount) {
                        maxCount = count;
                        mainTid = tid;
                    }
                }
                
                if (mainTid && maxCount > 0) {
                    const tname = tlist[mainTid].name || TNAME_MAP[mainTid] || `分区${mainTid}`;
                    log(`[关注分类] UP主 ${mid} 主要分区(搜索API-tlist): ${tname} (${maxCount}个视频)`);
                    
                    return {
                        tid: mainTid,
                        tname: tname,
                        videoCount: Object.values(tlist).reduce((sum, t) => sum + (t.count || 0), 0),
                        mainCount: maxCount,
                        method: 'search-tlist'
                    };
                }
            }

            // fallback：使用vlist数据
            if (!data.data?.list?.vlist) {
                log(`[调试] 搜索API无视频列表数据，data结构: ${JSON.stringify(Object.keys(data.data || {}))}`);
                return { tid: null, tname: '无视频数据', videoCount: 0, method: 'search' };
            }

            const videos = data.data.list.vlist;
            log(`[调试] 获得${videos.length}个视频，使用vlist数据分析`);
            
            if (videos.length === 0) {
                return { tid: null, tname: '无视频', videoCount: 0, method: 'search' };
            }

            // 统计各分区投稿数量 - 检查多个可能的分区字段
            const tidCounts = {};
            videos.forEach(video => {
                // 优先使用typeid字段（更稳定）
                const tid = video.typeid || video.tid || video.type_id || video.tId;
                if (tid && tid !== 0) {
                    tidCounts[tid] = (tidCounts[tid] || 0) + 1;
                }
            });

            log(`[调试] 搜索API分区统计: ${JSON.stringify(tidCounts)}`);

            if (Object.keys(tidCounts).length === 0) {
                return { tid: null, tname: '无有效分区', videoCount: videos.length, method: 'search' };
            }

            // 找出投稿最多的分区
            const mainTid = Object.keys(tidCounts).reduce((a, b) => 
                tidCounts[a] > tidCounts[b] ? a : b
            );

            const tname = TNAME_MAP[mainTid] || `分区${mainTid}`;
            const count = tidCounts[mainTid];

            log(`[关注分类] UP主 ${mid} 主要分区(搜索API-vlist): ${tname} (${count}/${videos.length}个视频)`);
            
            return {
                tid: mainTid,
                tname: tname,
                videoCount: videos.length,
                mainCount: count,
                method: 'search-vlist'
            };

        } catch (error) {
            log(`[关注分类] UP主 ${mid} 分析失败: ${error.message}`, 'error');
            return { tid: null, tname: '分析失败', error: error.message, method: 'error' };
        }
    }

    // ===== 获取用户分组信息 =====
    async function getUserFollowTags() {
        try {
            const data = await enhancedRequest('https://api.bilibili.com/x/relation/tags', {});
            
            if (data.code !== 0) {
                log(`获取关注分组失败: ${data.code} ${data.message || ''}`, 'error');
                return [];
            }
            
            const tags = data.data || [];
            log(`获取到 ${tags.length} 个关注分组`);
            return tags;
        } catch (error) {
            log(`获取关注分组异常: ${error.message}`, 'error');
            return [];
        }
    }

    // ===== 创建关注分组 =====
    async function createFollowTag(tagName) {
        try {
            const data = await enhancedRequest('https://api.bilibili.com/x/relation/tag/create', {
                tag: tagName,
                csrf: getCSRF()
            }, 'POST');
            
            if (data.code !== 0) {
                throw new Error(`创建分组失败: ${data.code} ${data.message || ''}`);
            }
            
            log(`成功创建分组: ${tagName}`);
            return data.data.tagid;
        } catch (error) {
            log(`创建分组失败: ${error.message}`, 'error');
            throw error;
        }
    }

    // ===== 添加UP主到分组 =====
    async function addUserToTag(mid, tagids) {
        try {
            const data = await enhancedRequest('https://api.bilibili.com/x/relation/tags/addUsers', {
                fids: mid,
                tagids: Array.isArray(tagids) ? tagids.join(',') : tagids,
                csrf: getCSRF()
            }, 'POST');
            
            if (data.code !== 0) {
                throw new Error(`添加到分组失败: ${data.code} ${data.message || ''}`);
            }
            
            return true;
        } catch (error) {
            log(`添加到分组失败: ${error.message}`, 'error');
            throw error;
        }
    }

    // ===== 从分组移除UP主 ===== 
    async function removeUserFromTag(mid, tagids) {
        try {
            const data = await enhancedRequest('https://api.bilibili.com/x/relation/tags/delUsers', {
                fids: mid,
                tagids: Array.isArray(tagids) ? tagids.join(',') : tagids,
                csrf: getCSRF()
            }, 'POST');
            
            if (data.code !== 0) {
                throw new Error(`从分组移除失败: ${data.code} ${data.message || ''}`);
            }
            
            return true;
        } catch (error) {
            log(`从分组移除失败: ${error.message}`, 'error');
            throw error;
        }
    }
    // ===== 获取关注列表 =====
    async function getFollowingList(limit = 50) {
        try {
            const allUsers = [];
            let currentPage = 1;
            const pageSize = 50; // B站API单页最大50
            
            log(`开始获取关注列表，目标数量: ${limit}`);
            
            while (allUsers.length < limit) {
                log(`正在获取第 ${currentPage} 页，已获取 ${allUsers.length} 个用户`);
                
                const data = await enhancedRequest('https://api.bilibili.com/x/relation/followings', {
                    vmid: getLoginMid(),
                    ps: pageSize,
                    pn: currentPage,
                    order: 'desc',
                    order_type: ''
                });

                if (data.code !== 0) {
                    throw new Error(`获取关注列表失败: ${data.code} ${data.message || ''}`);
                }
                
                const pageUsers = data.data?.list || [];
                log(`第 ${currentPage} 页获取到 ${pageUsers.length} 个用户`);
                
                if (pageUsers.length === 0) {
                    log('没有更多数据，停止获取');
                    break; // 没有更多数据
                }
                
                // 只添加我们还需要的用户数量
                const needCount = limit - allUsers.length;
                const usersToAdd = pageUsers.slice(0, needCount);
                allUsers.push(...usersToAdd);
                
                log(`已获取 ${allUsers.length}/${limit} 个关注用户`);
                
                // 如果已经获取足够或这页数据不足50，说明到底了
                if (allUsers.length >= limit || pageUsers.length < pageSize) {
                    break;
                }
                
                currentPage++;
                
                // 添加请求间隔
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            log(`最终获取到 ${allUsers.length} 个关注用户`);
            return allUsers;
        } catch (error) {
            log(`获取关注列表失败: ${error.message}`, 'error');
            throw error;
        }
    }

    // ===== 主分析流程 =====
    async function startClassification() {
        if (isProcessing) return;
        
        isProcessing = true;
        isPaused = false;
        
        const startBtn = document.getElementById('start-classify-btn');
        const pauseBtn = document.getElementById('pause-classify-btn');
        const actionButtons = document.getElementById('action-buttons');
        
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'block';
        actionButtons.style.display = 'none';

        try {
            updateProgress('获取关注列表...');
            
            const followingList = await getFollowingList(maxProcessCount);
            if (followingList.length === 0) {
                throw new Error('未获取到关注列表');
            }

            currentProgress.total = followingList.length; // 移除Math.min限制
            currentProgress.processed = 0;
            currentProgress.results = [];
            
            updateProgress(`开始分析 ${currentProgress.total} 个UP主...`, 0);

            // 并发控制（降低到1个并发）
            const concurrency = 1;
            const delay = 1500; // 增加到1.5秒间隔

            for (let i = 0; i < currentProgress.total; i += concurrency) {
                if (isPaused) break;

                const batch = followingList.slice(i, Math.min(i + concurrency, currentProgress.total));
                const promises = batch.map(async (user, index) => {
                    if (isPaused) return null;
                    
                    // 添加随机延迟
                    await new Promise(resolve => setTimeout(resolve, index * 200));
                    
                    const category = await analyzeUserCategory(user.mid, user.uname);
                    
                    const result = {
                        mid: user.mid,
                        uname: user.uname,
                        face: user.face,
                        ...category
                    };
                    
                    currentProgress.results.push(result);
                    currentProgress.processed++;
                    
                    const progress = (currentProgress.processed / currentProgress.total) * 100;
                    updateProgress(`已分析 ${currentProgress.processed}/${currentProgress.total} (${result.uname} - ${result.tname})`, progress);
                    
                    updateResultsDisplay();
                    
                    return result;
                });

                await Promise.all(promises);
                
                // 批次间延迟
                if (i + concurrency < currentProgress.total && !isPaused) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            if (!isPaused) {
                updateProgress(`分析完成！共分析 ${currentProgress.processed} 个UP主`, 100);
                actionButtons.style.display = 'block';
            } else {
                updateProgress(`已暂停，当前进度：${currentProgress.processed}/${currentProgress.total}`, (currentProgress.processed / currentProgress.total) * 100);
            }

        } catch (error) {
            updateProgress(`分析失败: ${error.message}`, 0);
            log(`分析失败: ${error.message}`, 'error');
        } finally {
            isProcessing = false;
            startBtn.style.display = 'block';
            startBtn.textContent = currentProgress.processed > 0 ? '继续分析' : '开始分析';
            pauseBtn.style.display = 'none';
        }
    }

    // ===== 暂停分析 =====
    function pauseClassification() {
        isPaused = true;
        updateProgress(`正在暂停...`);
    }

    // ===== 更新结果显示 =====
    function updateResultsDisplay() {
        const container = document.getElementById('results-container');
        if (!container) return;

        // 统计各分区数量
        const categoryStats = {};
        currentProgress.results.forEach(result => {
            const category = result.tname || '未知分区';
            categoryStats[category] = (categoryStats[category] || 0) + 1;
        });

        const sortedCategories = Object.entries(categoryStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10); // 只显示前10个分区

        container.innerHTML = `
            <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #333;">
                分析结果预览 (前10个分区):
            </div>
            ${sortedCategories.map(([category, count]) => `
                <div style="
                    display: flex;
                    justify-content: space-between;
                    padding: 6px 8px;
                    background: #f8f9fa;
                    margin-bottom: 4px;
                    border-radius: 4px;
                    font-size: 12px;
                ">
                    <span>${category}</span>
                    <span style="color: #00a1d6; font-weight: bold;">${count}人</span>
                </div>
            `).join('')}
        `;
    }

    // ===== 创建配置界面 =====
    async function createConfigUI(categoryGroups) {
        return new Promise((resolve, reject) => {
            const modal = document.createElement('div');
            modal.className = 'follow-classifier-modal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            // 获取现有分组
            getUserFollowTags().then(existingTags => {
                const content = document.createElement('div');
                content.style.cssText = `
                    background: white;
                    border-radius: 12px;
                    padding: 25px;
                    width: 800px;
                    max-width: 90vw;
                    max-height: 85vh;
                    overflow-y: auto;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
                `;

                content.innerHTML = `
                    <h3 style="margin-top: 0; color: #00a1d6; font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                        🏷️ 关注列表智能分类配置
                    </h3>

                    <div style="margin: 20px 0;">
                        <div style="display: flex; gap: 20px; margin-bottom: 15px;">
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="radio" name="operationMode" value="copy" checked style="margin-right: 8px;">
                                <span>复制模式（推荐）</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="radio" name="operationMode" value="move" style="margin-right: 8px;">
                                <span>移动模式</span>
                            </label>
                        </div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 15px;">
                            复制模式：保留原分组，创建新分组；移动模式：直接移动到新分组
                        </div>
                    </div>

                    <div style="margin: 20px 0;">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" id="autoClassifyUnassigned" checked style="margin-right: 8px;">
                            <span>对未自定义分组的UP主自动按分区分类</span>
                        </label>
                    </div>

                    <div style="margin: 20px 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                            <h4 style="margin: 0; color: #333;">自定义分组</h4>
                            <button id="addCustomGroup" style="
                                padding: 6px 12px; background: #00a1d6; color: white;
                                border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
                            ">+ 添加自定义分组</button>
                        </div>
                        <div id="customGroups"></div>
                    </div>

                    <div style="margin: 20px 0;">
                        <h4 style="color: #333; margin-bottom: 10px;">检测到的分区分组</h4>
                        <div style="max-height: 200px; overflow-y: auto; border: 1px solid #eee; border-radius: 6px; padding: 10px;">
                            ${Object.entries(categoryGroups).map(([category, users]) => `
                                <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f0f0f0;">
                                    <span>${category}</span>
                                    <span style="color: #666;">${users.length}个UP主</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 25px;">
                        <button id="cancelConfig" style="
                            padding: 10px 20px; background: #f0f0f0; color: #666;
                            border: none; border-radius: 6px; cursor: pointer;
                        ">取消</button>
                        <button id="confirmConfig" style="
                            padding: 10px 20px; background: #00a1d6; color: white;
                            border: none; border-radius: 6px; cursor: pointer;
                        ">开始分类</button>
                    </div>
                `;

                modal.appendChild(content);
                document.body.appendChild(modal);

                let customGroupCount = 0;

                // 添加自定义分组
                document.getElementById('addCustomGroup').onclick = () => {
                    customGroupCount++;
                    const groupDiv = document.createElement('div');
                    groupDiv.className = 'custom-group';
                    groupDiv.style.cssText = `
                        margin: 10px 0; padding: 15px; border: 1px solid #eee; 
                        border-radius: 6px; background: #fafafa;
                    `;

                    const categoryOptions = Object.entries(categoryGroups)
                        .map(([category, users]) => `
                            <label style="display: flex; align-items: center; margin: 5px 0; cursor: pointer;">
                                <input type="checkbox" value="${category}" style="margin-right: 8px;">
                                ${category} (${users.length}个UP主)
                            </label>
                        `).join('');

                    groupDiv.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <input type="text" class="group-name" placeholder="分组名称" style="
                                padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; width: 200px;
                            ">
                            <div>
                                <button class="use-existing" style="
                                    padding: 4px 8px; background: #f0f0f0; color: #666;
                                    border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 5px;
                                ">使用现有分组</button>
                                <button class="remove-group" style="
                                    padding: 4px 8px; background: #ff4d4f; color: white;
                                    border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
                                ">删除</button>
                            </div>
                        </div>
                        <div style="max-height: 120px; overflow-y: auto;">
                            ${categoryOptions}
                        </div>
                    `;

                    document.getElementById('customGroups').appendChild(groupDiv);

                    // 使用现有分组
                    groupDiv.querySelector('.use-existing').onclick = () => {
                        const select = document.createElement('select');
                        select.className = 'group-name';
                        select.style.cssText = `
                            padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; width: 220px;
                        `;
                        select.innerHTML = `
                            <option value="">选择现有分组</option>
                            ${existingTags.map(tag => `<option value="${tag.tagid}">${tag.name}</option>`).join('')}
                        `;
                        const input = groupDiv.querySelector('input.group-name');
                        input.parentNode.replaceChild(select, input);
                    };

                    // 删除分组
                    groupDiv.querySelector('.remove-group').onclick = () => {
                        groupDiv.remove();
                    };
                };

                // 取消配置
                document.getElementById('cancelConfig').onclick = () => {
                    modal.remove();
                    reject('用户取消操作');
                };

                // 确认配置
                document.getElementById('confirmConfig').onclick = () => {
                    const config = {
                        operationMode: document.querySelector('input[name="operationMode"]:checked').value,
                        autoClassifyUnassigned: document.getElementById('autoClassifyUnassigned').checked,
                        customGroups: []
                    };

                    // 收集自定义分组
                    document.querySelectorAll('.custom-group').forEach(group => {
                        const nameElement = group.querySelector('.group-name');
                        const selectedCategories = Array.from(group.querySelectorAll('input[type="checkbox"]:checked'))
                            .map(cb => cb.value);

                        if (selectedCategories.length > 0 && nameElement.value) {
                            config.customGroups.push({
                                name: nameElement.value,
                                isExisting: nameElement.tagName === 'SELECT',
                                tagId: nameElement.tagName === 'SELECT' ? nameElement.value : null,
                                categories: selectedCategories
                            });
                        }
                    });

                    modal.remove();
                    resolve(config);
                };

                // 点击背景关闭
                modal.onclick = (e) => {
                    if (e.target === modal) {
                        modal.remove();
                        reject('用户取消操作');
                    }
                };
            });
        });
    }

    // ===== 应用智能分组结果 =====
    async function applyResults() {
        if (currentProgress.results.length === 0) {
            alert('没有分析结果可应用');
            return;
        }

        try {
            // 按分区分组
            const categoryGroups = {};
            currentProgress.results.forEach(result => {
                const category = result.tname || '未知分区';
                if (!categoryGroups[category]) {
                    categoryGroups[category] = [];
                }
                categoryGroups[category].push(result);
            });

            // 显示配置界面
            const config = await createConfigUI(categoryGroups);
            
            updateProgress('正在应用智能分组...');
            
            log(`开始创建分组，模式: ${config.operationMode}`);
            
            let successCount = 0;
            let errorCount = 0;
            const operationResults = [];
            
            // 处理自定义分组
            for (const customGroup of config.customGroups) {
                try {
                    let targetTagId;
                    
                    if (customGroup.isExisting && customGroup.tagId) {
                        targetTagId = customGroup.tagId;
                        log(`使用现有分组: ${customGroup.name} (ID: ${targetTagId})`);
                    } else {
                        // 创建新分组
                        targetTagId = await createFollowTag(customGroup.name);
                        log(`成功创建分组: ${customGroup.name} (ID: ${targetTagId})`);
                    }
                    
                    // 添加选中分区的UP主到分组
                    for (const category of customGroup.categories) {
                        const users = categoryGroups[category] || [];
                        for (const user of users) {
                            try {
                                await addUserToTag(user.mid, targetTagId);
                                
                                successCount++;
                                operationResults.push({
                                    user: user.uname,
                                    group: customGroup.name,
                                    status: 'success'
                                });
                                
                                log(`成功添加 ${user.uname} 到分组 ${customGroup.name}`);
                            } catch (error) {
                                errorCount++;
                                operationResults.push({
                                    user: user.uname,
                                    group: customGroup.name,
                                    status: 'error',
                                    error: error.message
                                });
                                log(`添加 ${user.uname} 到分组 ${customGroup.name} 失败: ${error.message}`, 'error');
                            }
                            
                            // 添加延迟避免频率限制
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                        
                        // 从自动分类中移除已处理的分区
                        delete categoryGroups[category];
                    }
                    
                } catch (error) {
                    log(`处理自定义分组 ${customGroup.name} 失败: ${error.message}`, 'error');
                    errorCount++;
                }
            }
            
            // 处理未分组的UP主（自动按分区分类）
            if (config.autoClassifyUnassigned) {
                for (const [category, users] of Object.entries(categoryGroups)) {
                    try {
                        // 跳过太少用户的分组
                        if (users.length < 2) {
                            log(`跳过分组 "${category}"：用户数量太少 (${users.length})`);
                            continue;
                        }

                        // 创建分区分组
                        const groupName = `${category}区`;
                        const targetTagId = await createFollowTag(groupName);
                        log(`成功创建分区分组: ${groupName} (ID: ${targetTagId})`);

                        for (const user of users) {
                            try {
                                await addUserToTag(user.mid, targetTagId);
                                successCount++;
                                operationResults.push({
                                    user: user.uname,
                                    group: groupName,
                                    status: 'success'
                                });
                                log(`成功添加 ${user.uname} 到分组 ${groupName}`);
                            } catch (error) {
                                errorCount++;
                                operationResults.push({
                                    user: user.uname,
                                    group: groupName,
                                    status: 'error',
                                    error: error.message
                                });
                                log(`添加 ${user.uname} 到分组 ${groupName} 失败: ${error.message}`, 'error');
                            }
                            
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                        
                    } catch (error) {
                        log(`创建分区分组 "${category}" 失败: ${error.message}`, 'error');
                        errorCount++;
                    }
                }
            }

            const resultMessage = `分组完成！成功: ${successCount}，失败: ${errorCount}`;
            updateProgress(resultMessage, 100);
            log(resultMessage, successCount > 0 ? 'success' : 'error');
            
            if (operationResults.length > 0) {
                showOperationResults(operationResults);
            }

        } catch (error) {
            if (error === '用户取消操作') {
                updateProgress('操作已取消', 0);
            } else {
                updateProgress(`分组失败: ${error.message}`, 0);
                log(`分组失败: ${error.message}`, 'error');
            }
        }
    }

    // ===== 显示操作结果 =====
    function showOperationResults(results) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7); z-index: 20000;
            display: flex; align-items: center; justify-content: center;
        `;
        
        const successCount = results.filter(r => r.status === 'success').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        
        const groupedResults = {};
        results.forEach(result => {
            if (!groupedResults[result.group]) {
                groupedResults[result.group] = { success: [], error: [] };
            }
            groupedResults[result.group][result.status].push(result);
        });
        
        const resultHtml = Object.entries(groupedResults)
            .map(([groupName, groupResults]) => `
                <div style="margin-bottom: 16px; padding: 12px; border: 1px solid #e1e5e9; border-radius: 8px;">
                    <div style="font-weight: bold; color: #00a1d6; margin-bottom: 8px;">
                        ${groupName} (成功: ${groupResults.success.length}, 失败: ${groupResults.error.length})
                    </div>
                    ${groupResults.success.length > 0 ? `
                        <div style="margin-bottom: 4px;">
                            <span style="color: #28a745;">✓ 成功:</span>
                            <span style="font-size: 12px; color: #666;">
                                ${groupResults.success.slice(0, 5).map(r => r.user).join('、')}
                                ${groupResults.success.length > 5 ? `等${groupResults.success.length}人` : ''}
                            </span>
                        </div>
                    ` : ''}
                    ${groupResults.error.length > 0 ? `
                        <div>
                            <span style="color: #dc3545;">✗ 失败:</span>
                            <span style="font-size: 12px; color: #666;">
                                ${groupResults.error.slice(0, 3).map(r => `${r.user}(${r.error})`).join('、')}
                                ${groupResults.error.length > 3 ? `等${groupResults.error.length}人` : ''}
                            </span>
                        </div>
                    ` : ''}
                </div>
            `).join('');
        
        modal.innerHTML = `
            <div style="
                background: white; border-radius: 12px; padding: 24px;
                width: 600px; max-width: 90vw; max-height: 80vh; overflow-y: auto;
            ">
                <h3 style="margin-top: 0; color: #00a1d6; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                    📊 操作结果详情
                </h3>
                <div style="margin: 16px 0; padding: 12px; background: #f8f9fa; border-radius: 6px;">
                    <div style="font-weight: bold;">总结</div>
                    <div style="color: #28a745;">✓ 成功: ${successCount} 个操作</div>
                    <div style="color: #dc3545;">✗ 失败: ${errorCount} 个操作</div>
                </div>
                <div style="max-height: 400px; overflow-y: auto;">
                    ${resultHtml}
                </div>
                <div style="text-align: center; margin-top: 16px;">
                    <button onclick="this.closest('div').remove()" style="
                        padding: 8px 16px; background: #00a1d6; color: white;
                        border: none; border-radius: 6px; cursor: pointer;
                    ">关闭</button>
                </div>
            </div>
        `;
        
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
        document.body.appendChild(modal);
    }

    // ===== 显示分组预览 =====
    function showGroupPreview() {
        const categoryGroups = {};
        currentProgress.results.forEach(result => {
            const category = result.tname || '未知分区';
            if (!categoryGroups[category]) {
                categoryGroups[category] = [];
            }
            categoryGroups[category].push(result);
        });

        const previewHtml = Object.entries(categoryGroups)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([category, users]) => `
                <div style="margin-bottom: 12px; padding: 12px; border: 1px solid #e1e5e9; border-radius: 8px;">
                    <div style="font-weight: bold; color: #00a1d6; margin-bottom: 8px;">
                        ${category} (${users.length}人)
                    </div>
                    <div style="font-size: 12px; color: #666; line-height: 1.4;">
                        ${users.slice(0, 10).map(user => user.uname).join('、')}
                        ${users.length > 10 ? `等${users.length}人` : ''}
                    </div>
                </div>
            `).join('');

        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7); z-index: 20000;
            display: flex; align-items: center; justify-content: center;
        `;
        
        modal.innerHTML = `
            <div style="
                background: white; border-radius: 12px; padding: 24px;
                max-width: 600px; max-height: 80vh; overflow-y: auto;
                margin: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            ">
                <div style="font-size: 18px; font-weight: bold; margin-bottom: 16px; color: #333;">
                    📊 智能分组预览
                </div>
                ${previewHtml}
                <div style="text-align: center; margin-top: 20px;">
                    <button onclick="this.closest('.fixed').remove()" style="
                        padding: 10px 20px; background: #00a1d6; color: white;
                        border: none; border-radius: 6px; cursor: pointer;
                    ">关闭预览</button>
                </div>
            </div>
        `;
        
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
        document.body.appendChild(modal);
    }
    
    // ===== 导出分析结果 =====
    function exportResults() {
        if (currentProgress.results.length === 0) {
            alert('没有分析结果可导出');
            return;
        }

        showDataTable();
    }
    
    // ===== 显示数据表格界面 =====
    function showDataTable() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.8); z-index: 20000;
            display: flex; align-items: center; justify-content: center;
            padding: 20px;
        `;
        
        // 生成表格HTML
        const tableRows = currentProgress.results.map((result, index) => `
            <tr style="border-bottom: 1px solid #e1e5e9;">
                <td style="padding: 8px; text-align: center;">${index + 1}</td>
                <td style="padding: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <img src="${result.face}" style="width: 32px; height: 32px; border-radius: 50%;" />
                        <div>
                            <div style="font-weight: bold;">${result.uname}</div>
                            <div style="font-size: 11px; color: #666;">UID: ${result.mid}</div>
                        </div>
                    </div>
                </td>
                <td style="padding: 8px; text-align: center;">
                    <span style="
                        background: #e3f2fd; color: #1976d2; 
                        padding: 2px 8px; border-radius: 12px; font-size: 12px;
                    ">${result.tname || '未知'}</span>
                </td>
                <td style="padding: 8px; text-align: center;">${result.videoCount || 0}</td>
                <td style="padding: 8px; text-align: center;">${result.mainCount || 0}</td>
                <td style="padding: 8px; text-align: center;">
                    <span style="
                        background: ${getMethodColor(result.method)}; color: white;
                        padding: 2px 6px; border-radius: 8px; font-size: 11px;
                    ">${getMethodName(result.method)}</span>
                </td>
            </tr>
        `).join('');
        
        modal.innerHTML = `
            <div style="
                background: white; border-radius: 12px; padding: 24px;
                width: 90vw; max-width: 1200px; height: 85vh;
                display: flex; flex-direction: column;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <div>
                        <div style="font-size: 20px; font-weight: bold; color: #333; margin-bottom: 4px;">
                            📊 分析结果数据表
                        </div>
                        <div style="font-size: 14px; color: #666;">
                            共 ${currentProgress.results.length} 个UP主的分析结果
                        </div>
                    </div>
                    <button onclick="this.closest('div').remove(); if (!document.getElementById('bilibili-classifier-panel')) createControlPanel();" style="
                        background: #f5f5f5; border: none; border-radius: 6px;
                        padding: 8px 12px; cursor: pointer; font-size: 14px;
                    ">✕ 关闭</button>
                </div>
                
                <div style="
                    flex: 1; overflow: auto; border: 1px solid #e1e5e9; 
                    border-radius: 8px; background: #fafafa;
                ">
                    <table style="width: 100%; border-collapse: collapse; background: white;">
                        <thead>
                            <tr style="background: #f8f9fa; border-bottom: 2px solid #e1e5e9;">
                                <th style="padding: 12px; text-align: center; font-weight: bold; color: #495057;">序号</th>
                                <th style="padding: 12px; text-align: left; font-weight: bold; color: #495057;">UP主信息</th>
                                <th style="padding: 12px; text-align: center; font-weight: bold; color: #495057;">主要分区</th>
                                <th style="padding: 12px; text-align: center; font-weight: bold; color: #495057;">总视频数</th>
                                <th style="padding: 12px; text-align: center; font-weight: bold; color: #495057;">主分区视频数</th>
                                <th style="padding: 12px; text-align: center; font-weight: bold; color: #495057;">分析方法</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
                
                <div style="display: flex; gap: 12px; margin-top: 20px; justify-content: center;">
                    <button onclick="this.closest('div').remove(); if (!document.getElementById('bilibili-classifier-panel')) createControlPanel();" style="
                        padding: 10px 20px; background: #6c757d; color: white;
                        border: none; border-radius: 6px; cursor: pointer; font-size: 14px;
                    ">← 返回控制面板</button>
                    <button id="download-csv" style="
                        padding: 10px 20px; background: #28a745; color: white;
                        border: none; border-radius: 6px; cursor: pointer; font-size: 14px;
                    ">📄 下载CSV</button>
                    <button id="download-json" style="
                        padding: 10px 20px; background: #17a2b8; color: white;
                        border: none; border-radius: 6px; cursor: pointer; font-size: 14px;
                    ">📋 下载JSON</button>
                    <button id="copy-data" style="
                        padding: 10px 20px; background: #6f42c1; color: white;
                        border: none; border-radius: 6px; cursor: pointer; font-size: 14px;
                    ">📋 复制数据</button>
                </div>
            </div>
        `;
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
                // 确保控制面板存在，如果不存在则重新创建
                if (!document.getElementById('bilibili-classifier-panel')) {
                    createControlPanel();
                }
            }
        };
        
        document.body.appendChild(modal);
        
        // 绑定下载事件
        document.getElementById('download-csv').onclick = () => downloadData('csv');
        document.getElementById('download-json').onclick = () => downloadData('json');
        document.getElementById('copy-data').onclick = () => copyDataToClipboard();
    }
    
    // ===== 获取方法显示名称 =====
    function getMethodName(method) {
        const methodMap = {
            'upstat': '统计API',
            'search-tlist': '搜索-统计',
            'search-vlist': '搜索-视频',
            'channel': '频道API',
            'error': '分析失败'
        };
        return methodMap[method] || method;
    }
    
    // ===== 获取方法颜色 =====
    function getMethodColor(method) {
        const colorMap = {
            'upstat': '#28a745',
            'search-tlist': '#17a2b8',
            'search-vlist': '#ffc107',
            'channel': '#6f42c1',
            'error': '#dc3545'
        };
        return colorMap[method] || '#6c757d';
    }
    
    // ===== 下载数据 =====
    function downloadData(format) {
        try {
            let content, filename, mimeType;
            
            if (format === 'csv') {
                // CSV格式
                const csvHeader = 'UP主昵称,UID,主要分区,总视频数,主分区视频数,分析方法,头像URL\n';
                const csvData = currentProgress.results.map(result => 
                    `"${result.uname}",${result.mid},"${result.tname}",${result.videoCount || 0},${result.mainCount || 0},"${getMethodName(result.method)}","${result.face}"`
                ).join('\n');
                content = '\ufeff' + csvHeader + csvData; // 添加BOM用于Excel正确显示中文
                filename = `B站关注列表分析_${new Date().toISOString().slice(0, 10)}.csv`;
                mimeType = 'text/csv;charset=utf-8';
            } else if (format === 'json') {
                // JSON格式
                const jsonData = {
                    exportTime: new Date().toISOString(),
                    totalCount: currentProgress.results.length,
                    summary: generateSummary(),
                    data: currentProgress.results.map(result => ({
                        uname: result.uname,
                        mid: result.mid,
                        face: result.face,
                        category: {
                            tid: result.tid,
                            tname: result.tname
                        },
                        statistics: {
                            videoCount: result.videoCount || 0,
                            mainCount: result.mainCount || 0
                        },
                        method: result.method,
                        methodName: getMethodName(result.method)
                    }))
                };
                content = JSON.stringify(jsonData, null, 2);
                filename = `B站关注列表分析_${new Date().toISOString().slice(0, 10)}.json`;
                mimeType = 'application/json;charset=utf-8';
            }
            
            // 创建下载
            const blob = new Blob([content], { type: mimeType });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            log(`数据已导出为${format.toUpperCase()}文件: ${filename}`, 'success');
            
        } catch (error) {
            alert(`导出失败: ${error.message}`);
            log(`导出失败: ${error.message}`, 'error');
        }
    }
    
    // ===== 生成数据摘要 =====
    function generateSummary() {
        const categoryStats = {};
        const methodStats = {};
        
        currentProgress.results.forEach(result => {
            const category = result.tname || '未知分区';
            const method = result.method;
            
            categoryStats[category] = (categoryStats[category] || 0) + 1;
            methodStats[method] = (methodStats[method] || 0) + 1;
        });
        
        return {
            categoryDistribution: categoryStats,
            methodDistribution: methodStats,
            topCategories: Object.entries(categoryStats)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([category, count]) => ({ category, count }))
        };
    }
    
    // ===== 复制数据到剪贴板 =====
    async function copyDataToClipboard() {
        try {
            const textData = currentProgress.results.map((result, index) => 
                `${index + 1}\t${result.uname}\t${result.mid}\t${result.tname}\t${result.videoCount || 0}\t${result.mainCount || 0}\t${getMethodName(result.method)}`
            ).join('\n');
            
            const header = '序号\tUP主昵称\tUID\t主要分区\t总视频数\t主分区视频数\t分析方法\n';
            const fullText = header + textData;
            
            await navigator.clipboard.writeText(fullText);
            alert('数据已复制到剪贴板！可以直接粘贴到Excel或其他表格软件中。');
            log('数据已复制到剪贴板', 'success');
        } catch (error) {
            alert(`复制失败: ${error.message}`);
            log(`复制失败: ${error.message}`, 'error');
        }
    }

    // ===== 工具函数 =====
    function getLoginMid() {
        const match = document.cookie.match(/DedeUserID=(\d+)/);
        return match ? match[1] : null;
    }

    function log(message, type = 'info') {
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
        console.log(`${prefix} [B站关注分类] ${message}`);
    }

    // ===== 初始化 =====
    function addTriggerButton() {
        // 检测是否在关注列表页面
        if (!window.location.href.includes('/relation/follow')) {
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
        btn.textContent = '🏷️ 智能分类';
        btn.title = '按UP主最常投稿分区自动分类关注列表';
        btn.onclick = createControlPanel;

        btnContainer.appendChild(btn);
        document.body.appendChild(btnContainer);
        
        log('关注分类功能已加载（智能分组版v3.0）');
    }

    // ===== 页面加载和监听 =====
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
