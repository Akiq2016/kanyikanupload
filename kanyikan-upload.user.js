// ==UserScript==
// @name         tampermonkey_tool_for_kanyikanplus_upload
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  tampermonkey tool for kanyikanplus upload
// @author       Akiq
// @match        https://kanyikanplus.weixin.qq.com/*
// @grant       GM_xmlhttpRequest
// @require https://cdnjs.cloudflare.com/ajax/libs/jquery/2.1.3/jquery.min.js
// ==/UserScript==

(function () {
  "use strict";

  function onResponse (xhr) {
    const { url } = xhr.listenerParams;

    // 可使用上一个账号传过的视频列表。
    if (isUploadFetch(url)) {
      // 针对看一看存储的数据对象
      let dict = getFromLocalStorage(_namespace) || {};
      dict = clearOldData(dict)
      // 当前用户key
      const key = window.localStorage.getItem('login_id');
      // 待存储的新内容
      const item = {
        expired_at: +new Date() + 5 * 60 * 60 * 1000, // 5小时有效期
        uploaded_list: ((dict[key] || {}).uploaded_list || []).concat(xhr.listenerParams),
      };
      window.localStorage.setItem(_namespace, JSON.stringify({
        ...dict,
        latest: key,
        [key]: item,
      }))
    }
  }

  const oldopen = XMLHttpRequest.prototype.open;
  const oldsend = XMLHttpRequest.prototype.send;
  const oldsetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.listenerParams = {
    headers: {},
    data: null,
  };

  XMLHttpRequest.prototype.setRequestHeader = function (key, value) {
    // 添加数据备份
    this.listenerParams.headers[key] = value;
    oldsetRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.open = function (method, url, async) {
    // 添加数据备份
    this.listenerParams = {
      ...this.listenerParams,
      method: (method && method.toLowerCase()) || '',
      url: url,
      async: async,
      data: null,
    }

    oldopen.apply(this, arguments);
  }

  XMLHttpRequest.prototype.send = function (data) {
    // 添加数据备份
    if (this.listenerParams.method == 'post'){
      this.listenerParams.data = data;
    }

    // 添加成功响应
    let oldOnreadystatechange = this.onreadystatechange;
    this.onreadystatechange = function () {
      if (this.readyState == 4 && this.status == 200) {
        onResponse(this);
      }

      if (oldOnreadystatechange) {
        oldOnreadystatechange.apply(this, arguments);
      }
    };

    oldsend.apply(this, arguments);
  }

  const _namespace = "HEYW";

  function isUploadFetch(url) {
    return `${url}`.indexOf('applyforupload?session=') !== -1
  }

  function getFromLocalStorage (key) {
    let value = window.localStorage.getItem(key)
    if (value === "" || value === null) {
      return undefined;
    } else {
      return JSON.parse(value);
    }
  }

  function clearOldData (dict) {
    const current = +new Date();
    let latest;
    const res = Object.keys(dict)
      .filter((key) => key !== "latest" && current < dict[key].expired_at)
      .reduce((acc, key) => {
        if (
          !latest ||
          dict[latest].expired_at < dict[key].expired_at
        ) {
          latest = key;
        }

        return {
          ...acc,
          [key]: dict[key]
        }
      }, {});
    res.latest = latest;
    return res;
  }

  function query2obj(params) {
    return JSON.parse(
      '{"' + decodeURI(params.replace(/&/g, '","').replace(/=/g, '":"')) + '"}'
    );
  }

  function obj2query(params = {}) {
    return Object.keys(params)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent((params)[key])}`)
      .join("&");
  }

  function replaceSession (url) {
    if (url.indexOf('?') !== -1) {
      let [a, b] = url.split('?')
      let queryObj = query2obj(b);
      queryObj.session = (getFromLocalStorage("session_key") || {}).session
      return a + "?" + obj2query(queryObj);
    } else {
      return url;
    }
  }

  function getExecutingTips (pending, success, fail) {
    return `(${pending}个上传中)(${success}个成功)(${fail}个失败)`
  }

  // 插入操作按钮
  const wrapper = document.querySelector('.title');
  const newBtn = document.createElement('button')
  const TIPS = '点我，快捷上传最近上传过的视频';
  newBtn.innerHTML = TIPS;
  wrapper.append(newBtn);
  newBtn.addEventListener("click", function () {
    const currentKey = window.localStorage.getItem("login_id");
    const dict = getFromLocalStorage(_namespace) || {};
    if (dict.latest === currentKey) {
      alert("当前视频列表已是最新！换个账号再试试吧！");
    } else if (!dict.latest) {
      alert("最近没有上传过视频哦！");
    } else if (dict.latest !== currentKey) {
      alert("正在自动上传最近上传过的视频！");
      const uploadList = (dict[dict.latest] || {}).uploaded_list || []
      if (uploadList.length) {
        let pendingSum = uploadList.length;
        let successSum = 0;
        let failSum = 0;
        newBtn.innerHTML = TIPS + getExecutingTips(pendingSum, successSum, failSum);
        uploadList.forEach((item, index) => {
          setTimeout(() => {
            $.ajax({
              method: item.method,
              url: replaceSession(item.url),
              headers: item.headers,
              data: item.data,
              complete: (_, status) => {
                if (status === "success") {
                  newBtn.innerHTML = TIPS + getExecutingTips(--pendingSum, ++successSum, failSum);
                } else {
                  newBtn.innerHTML = TIPS + getExecutingTips(--pendingSum, successSum, ++failSum);
                }
                setTimeout(() => {
                  if (pendingSum === 0) {
                    alert("上传完毕，请刷新一下页面吧！")
                  }
                })
              }
            });
          }, 1000 * index);
        });
      }
    }
  })
})();
