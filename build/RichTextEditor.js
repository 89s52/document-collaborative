(function (global, factory) {
    if (typeof define === "function" && define.amd) {
        define(['module', './TextOperateHistroy.js'], factory);
    } else if (typeof exports !== "undefined") {
        factory(module, require('./TextOperateHistroy.js'));
    } else {
        var mod = {
            exports: {}
        };
        factory(mod, global.TextOperateHistroy);
        global.RichTextEditor = mod.exports;
    }
})(this, function (module, TextOperateHistroy) {
    'use strict';

    function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
            throw new TypeError("Cannot call a class as a function");
        }
    }

    var _createClass = function () {
        function defineProperties(target, props) {
            for (var i = 0; i < props.length; i++) {
                var descriptor = props[i];
                descriptor.enumerable = descriptor.enumerable || false;
                descriptor.configurable = true;
                if ("value" in descriptor) descriptor.writable = true;
                Object.defineProperty(target, descriptor.key, descriptor);
            }
        }

        return function (Constructor, protoProps, staticProps) {
            if (protoProps) defineProperties(Constructor.prototype, protoProps);
            if (staticProps) defineProperties(Constructor, staticProps);
            return Constructor;
        };
    }();

    //不需要闭合的标签，单独计算长度
    var unCloseTag = ['img', 'input', 'br', 'hr'];
    var rootNodeClass = 'root-elem';
    var editorBoxClass = 'w-e-text';

    function last(arr) {
        return arr[arr.length - 1];
    }

    //这里初始化自定义事件，并创建editor
    module.exports = function () {
        function RichTextCodeMirror(wangEditor) {
            _classCallCheck(this, RichTextCodeMirror);

            wangEditor.customConfig.debug = true; //开启editor调试模式
            // 自定义 onchange 触发的延迟时间，默认为 200 ms
            wangEditor.customConfig.onchangeTimeout = 100; // 单位 ms
            wangEditor.customConfig.onchange = function (html) {
                // html 即变化之后的内容
                //console.log(html)
                this.onChange(html);
            }.bind(this);
            wangEditor.customConfig.onfocus = function () {
                //第一次选取编辑器时会与click操作冲突
                //console.log('onfocus')
                //this.onFocus()
            }.bind(this);
            wangEditor.customConfig.onblur = function (html) {
                //console.log("onblur")
                //this.onBlur(html)
            }.bind(this);

            //生成编辑器 wangEditor.create(),把wangEditor 转成editor实例
            wangEditor.create();

            this.editor = wangEditor;

            //获取鼠标点击事件
            this.editor.$textContainerElem.on("click", function (e) {
                // 获取鼠标点击事件，和鼠标滑选操作
                //console.log("click")
                this.onClick();
            }.bind(this));

            //初始化历史记录
            this.TextOpHistroy = new TextOperateHistroy(this);

            this.changes = []; //未发送的操作步骤缓存

            //创建临时编辑容器，取代原有编辑器的textarea，释放当前用户的鼠标选区
            this.tempRange = null; //editor-click事件时的鼠标位置
            //编辑器自定义事件绑定
            Utils.makeEventEmitter(RichTextCodeMirror, ['change'], this);
        }

        _createClass(RichTextCodeMirror, [{
            key: 'detach',
            value: function detach() {
                if (parseInt(window.wangEditor.version) > 4) {
                    this.wangEditor.off('changes', this.onwangEditorChange_.bind(this));
                } else {
                    this.wangEditor.off('change', this.onwangEditorChange_.bind(this));
                }
                this.wangEditor.off('cursorActivity', this.onCursorActivity_.bind(this));
            }
        }, {
            key: 'onChange',
            value: function onChange(html) {
                // 正常情况是逐个删除或插入，但是存在鼠标滑动选择或者快捷键选取文字后直接输入文字替换
                // 这种情况下，应该先计算删除操作，在计算插入操作，拆分成多个步骤
                var domChanges = this.getEditorDomChangeInfo();
                var selectionData = this.getUserCursorInfo();
                //当由编辑器focus导致的编辑器active状态变化，从而发起onchange，此时主动取消此次onchange事件
                if (!domChanges) {
                    return;
                }

                //如果当前操作被锁定，先暂存操作记录，后期遗弃发送
                if (!this.TextOpHistroy.isLocked) {
                    ///这里触发自定义的change事件，处理operation，cursor，和本地历史记录相关 {operatios,metadata} 操作步骤和鼠标位置记录
                    //  把编辑器的操作拆分成多个单独步(编辑器把文本样式修改合并成一个change，应该先删除，在插入)
                    this.changes.push(domChanges);
                    this.trigger('change', this, this.changes, selectionData);
                } else {
                    //如果文本暂时不能修改，保存操作，后期再发送
                    this.changes.push(domChanges);
                    setTimeOut(function () {
                        this.trigger('change', this, this.changes, selectionData);
                    }.bind(this), 0);
                }
            }
        }, {
            key: 'onFocus',
            value: function onFocus() {
                //获取鼠标位置，更新，推送鼠标位置信息
            }
        }, {
            key: 'onBlur',
            value: function onBlur(html) {
                //更新，推送鼠标位置信息
            }
        }, {
            key: 'onClick',
            value: function onClick() {
                //TODO滑动鼠标后在释放鼠标右键，会触发click ,选中后，再次单击，取到的range仍是上次选中的信息
                this.setUserCursor();
            }
        }, {
            key: 'setUserCursor',
            value: function setUserCursor() {
                var cursorData = this.getUserCursorInfo();
                //console.log('setUserCursor', cursorData)
                //鼠标滑选了文本，不是单纯的点击后输入
                if (!cursorData.collapsed) {
                    return;
                }
                this.tempRange = cursorData;
                //同时更新editor的selection
                //TODO -- getSelectionContainerElem,获取range选取，对选区可进行操作
            }
        }, {
            key: 'getUserCursorInfo',
            value: function getUserCursorInfo() {
                var treeNode = this.getRootRanderTree();

                //这里 rangeRootContainer 取的是$textElement,不能直接修改,从Element转成node，当前range的parent，不一定是根节点
                var rangeRootContainer = this.editor.selection.getSelectionContainerElem()[0];
                var range = this.editor.selection.getRange();

                //rootElemsBeforeCursor 获取当前光标根节点前的 所有文档根节点，和当前根节点
                var rootElemsBeforeCursor = this.getCurrentRootElemBefore(rangeRootContainer);
                var currentContainer;
                var splitText = '';
                var distance = 0,
                    start,
                    end;

                //开始节点信息
                var startContainerInfo = {};

                //结束节点信息
                var endContainerInfo = {};

                //根据相对位置，计算实际html文本长度    
                function getSplitText(rootElemsBeforeCursor, limitOption) {
                    var prevRootElems = rootElemsBeforeCursor.prevRootElems;
                    for (var i in prevRootElems) {
                        var prNode = cleanCustromTag([prevRootElems[i]]);
                        if (prNode && prNode[0]) splitText += getCharByJsonTree(prNode[0]);
                    }
                    //清理custrom定义的标签
                    var nodes = cleanCustromTag([rootElemsBeforeCursor.currentRootElem]);
                    if (nodes && nodes[0]) {
                        splitText += getCharByJsonTree(nodes[0], limitOption);
                    }
                }

                //在chrome和ff下，选取文本后设置样式，获取到的container是不一致的
                if (range.startContainer === range.endContainer) {
                    //同一元素dom
                    if (range.startOffset === range.endOffset) {
                        //只单点了光标
                        var startContainer = range.startContainer;
                        var domDeep = this.getNodeDeepSize(startContainer);
                        var nodeListIndex = getNodeIndex(startContainer, rangeRootContainer);
                        var startLimitOption = {
                            nodeName: startContainer.nodeName,
                            nodeType: startContainer.nodeType,
                            nodeValue: startContainer.nodeValue,
                            domDeep: domDeep,
                            startOffset: range.startOffset,
                            endOffset: range.endOffset,
                            rootNodeIndex: rootElemsBeforeCursor.prevRootElems.length,
                            container: startContainer,
                            nodeListIndex: nodeListIndex
                        };
                        getSplitText(rootElemsBeforeCursor, startLimitOption);

                        start = end = splitText.length;
                        startContainerInfo = {
                            nodeType: startLimitOption.nodeType,
                            nodeValue: startLimitOption.nodeValue,
                            startOffset: range.startOffset,
                            endOffset: range.endOffset,
                            domDeep: domDeep,
                            rootNodeIndex: startLimitOption.rootNodeIndex,
                            nodeListIndex: nodeListIndex
                        };
                    } else {
                        //TODO -- 鼠标拖选中了文字
                        var _startContainer = range.startContainer;
                        var _domDeep = this.getNodeDeepSize(_startContainer);
                        var _nodeListIndex = getNodeIndex(_startContainer, rangeRootContainer);
                        var _startLimitOption = {
                            nodeName: _startContainer.nodeName,
                            nodeType: _startContainer.nodeType,
                            nodeValue: _startContainer.nodeValue,
                            domDeep: _domDeep,
                            startOffset: range.startOffset,
                            endOffset: range.endOffset,
                            rootNodeIndex: rootElemsBeforeCursor.prevRootElems.length,
                            container: _startContainer,
                            nodeListIndex: _nodeListIndex
                        };

                        getSplitText(rootElemsBeforeCursor, _startLimitOption);

                        distance = Math.abs(range.endOffset - range.startOffset);
                        start = splitText.length;
                        end = start + distance;
                        startContainerInfo = {
                            nodeType: _startLimitOption.nodeType,
                            nodeValue: _startLimitOption.nodeValue,
                            startOffset: range.startOffset,
                            endOffset: range.endOffset,
                            domDeep: _domDeep,
                            rootNodeIndex: _startLimitOption.rootNodeIndex,
                            nodeListIndex: _nodeListIndex
                        };
                    }
                } else {
                    //TODO -- 跨元素dom,需要计算涉及的每个子元素
                    var _startContainer2 = range.startContainer;
                    var _domDeep2 = this.getNodeDeepSize(_startContainer2);
                    var _nodeListIndex2 = getNodeIndex(_startContainer2, rangeRootContainer);
                    var _startLimitOption2 = {
                        nodeName: _startContainer2.nodeName,
                        nodeType: _startContainer2.nodeType,
                        nodeValue: _startContainer2.nodeValue,
                        domDeep: _domDeep2,
                        startOffset: range.startOffset,
                        endOffset: range.endOffset,
                        rootNodeIndex: rootElemsBeforeCursor.prevRootElems.length,
                        container: _startContainer2,
                        nodeListIndex: _nodeListIndex2
                    };
                    startContainerInfo = {
                        nodeType: _startLimitOption2.nodeType,
                        nodeValue: _startLimitOption2.nodeValue,
                        startOffset: range.startOffset,
                        endOffset: range.endOffset,
                        domDeep: _domDeep2,
                        rootNodeIndex: _startLimitOption2.rootNodeIndex,
                        nodeListIndex: _nodeListIndex2
                    };

                    var endContainer = range.endContainer;
                    var enddomDeep = this.getNodeDeepSize(endContainer);
                    var endnodeListIndex = getNodeIndex(endContainer, rangeRootContainer);
                    var endLimitOption = {
                        nodeName: endContainer.nodeName,
                        nodeType: endContainer.nodeType,
                        nodeValue: endContainer.nodeValue,
                        domDeep: enddomDeep,
                        startOffset: range.startOffset,
                        endOffset: range.endOffset,
                        rootNodeIndex: rootElemsBeforeCursor.prevRootElems.length,
                        container: endnodeListIndex,
                        nodeListIndex: endnodeListIndex
                    };

                    endContainerInfo = {
                        nodeType: endLimitOption.nodeType,
                        nodeValue: endLimitOption.nodeValue,
                        startOffset: range.startOffset,
                        endOffset: range.endOffset,
                        domDeep: enddomDeep,
                        rootNodeIndex: endLimitOption.rootNodeIndex,
                        nodeListIndex: endnodeListIndex
                    };

                    getSplitText(rootElemsBeforeCursor, _startLimitOption2);
                    start = splitText.length;
                    splitText = '';
                    getSplitText(rootElemsBeforeCursor, endLimitOption);
                    end = splitText.length;
                }

                //rangeData 转换位置后，传递出去的鼠标range信息
                var rangeData = {
                    start: start, //html文本开始位置
                    end: end, //html文本结束位置
                    collapsed: range.collapsed, //选区是否重合
                    startContainerInfo: startContainerInfo, //开始节点信息
                    endContainerInfo: endContainerInfo //结束节点信息
                };

                return rangeData;
            }
        }, {
            key: 'getEditorDomChangeInfo',
            value: function getEditorDomChangeInfo() {
                var html = this.getEditorCtx();
                var domChangeInfo = this.TextOpHistroy.getDelta(html);
                return domChangeInfo;
            }
        }, {
            key: 'getEditorCtx',
            value: function getEditorCtx() {
                return this.editor.txt.html();
            }
        }, {
            key: 'setStrToNodeLists',
            value: function setStrToNodeLists(str) {
                var el = document.createElement("div");
                el.setAttribute("id", getRandom());
                el.innerHTML = str;
                return el.childNodes;
            }
        }, {
            key: 'setStrToDOMElement',
            value: function setStrToDOMElement(str) {
                var el = document.createElement("div");
                el.setAttribute("id", getRandom());
                el.innerHTML = str;
                return el.children;
            }
        }, {
            key: 'setDOMElementToStr',
            value: function setDOMElementToStr(elem) {
                var tmpStr = '';
                for (var i = 0, len = elem.length; i < len; i++) {
                    var item = elem[i];
                    var innerHtml = item.innerHTML;
                    var tag = item.tagName.toLocaleLowerCase();
                    var attrs = item.attributes;
                    tmpStr += '<' + tag;
                    for (var j = 0, _len = attrs.length; j < _len; j++) {
                        tmpStr += ' ' + attrs[j].nodeName + '="' + attrs[j].nodeValue + '"';
                    }
                    if (unCloseTag.indexOf(tag) > -1) {
                        tmpStr += '>';
                    } else {
                        tmpStr += '>' + innerHtml + '</' + tag + '>';
                    }
                }
                return tmpStr;
            }
        }, {
            key: 'cleanHtmlElem',
            value: function cleanHtmlElem(html) {
                if (!html || typeof html !== "string") {
                    return;
                } else {
                    var dom = this.setStrToDOMElement(html);
                    return cleanCustromTag(dom);
                }
            }
        }, {
            key: 'getCleanHtml',
            value: function getCleanHtml() {
                var ctx = this.getEditorCtx();
                var htmlElem = this.cleanHtmlElem(ctx);
                var htmlstr = this.setDOMElementToStr(htmlElem);
                return htmlstr;
            }
        }, {
            key: 'replaceHtmlSymbol',
            value: function replaceHtmlSymbol(html) {
                if (html == null) {
                    return '';
                }
                return html.replace(/</gm, '&lt;').replace(/>/gm, '&gt;').replace(/"/gm, '&quot;').replace(/(\r\n|\r|\n)/g, '<br/>');
            }
        }, {
            key: 'getChildrenJSON',
            value: function getChildrenJSON(elem) {
                var result = [];
                for (var i = 0, len = elem.length; i < len; i++) {
                    var curElem = elem[i];
                    var elemResult = void 0;
                    var nodeType = curElem.nodeType;
                    var classstr = curElem.attributes && curElem.attributes["class"];
                    if (classstr && (classstr.nodeValue.match("user-bg-color") || classstr.nodeValue.match("user-cursor"))) {
                        break;
                    }
                    // 文本节点 textContent可改写，nodeValue是只读的
                    if (nodeType === 3) {
                        elemResult = curElem.textContent;
                        elemResult = this.replaceHtmlSymbol(elemResult);
                    }

                    // 普通 DOM 节点
                    if (nodeType === 1) {
                        elemResult = {};

                        // tag
                        elemResult.tag = curElem.nodeName.toLowerCase();
                        // attr
                        var attrData = [];
                        var attrList = curElem.attributes || {};
                        var attrListLength = attrList.length || 0;
                        for (var _i = 0; _i < attrListLength; _i++) {
                            var attr = attrList[_i];
                            attrData.push({
                                name: attr.name,
                                value: attr.value
                            });
                        }
                        elemResult.attrs = attrData;
                        elemResult.content = curElem.textContent;
                        // children（递归）
                        elemResult.children = this.getChildrenJSON(curElem.childNodes);
                    }

                    result.push(elemResult);
                };
                return result;
            }
        }, {
            key: 'getNodeDeepSize',
            value: function getNodeDeepSize(node) {
                var size = [];
                var child = node;

                function getDeepSize(child) {
                    var child = child;
                    var parent = child.parentElement;
                    if (parent.nodeType === 1) {
                        var classValue = parent.getAttribute("class");
                        if (classValue && (classValue.indexOf("user-bg-color") > -1 || classValue.indexOf("user-cursor") > -1)) {
                            return;
                        } else if (!parent.getAttribute("id") || parent.getAttribute("id").indexOf("text-elem") < 0) {
                            size.unshift(getNodeIndex(child, parent));
                        } else if (parent.getAttribute("id") && parent.getAttribute("id").indexOf("text-elem") > -1) {
                            size.unshift(getNodeIndex(child, parent));
                            return;
                        } else {
                            return; //跳出递归
                        }
                    } else if (parent.nodeType === 3) {
                        //parent都是 #Text 节点，这就由有问题了
                        alert("父节点不可能是文本节点");
                    }
                    getDeepSize(parent);
                }
                getDeepSize(child);
                //console.log('size',size)
                return size;
            }
        }, {
            key: 'getRootRanderTree',
            value: function getRootRanderTree() {
                var ctx = this.getEditorCtx();
                var htmlElem = this.cleanHtmlElem(ctx);
                var json = this.getChildrenJSON(htmlElem);
                return json;
            }
        }, {
            key: 'getCurrentRootElemBefore',
            value: function getCurrentRootElemBefore(rootSelectionElem) {
                // 获取当前光标根节点前的所有div.root-elem
                var rootElems = this.editor.$textElem[0].childNodes;
                var currentRootElem = null;
                var prevRootElems = [];
                var result = void 0;
                for (var i = 0, len = rootElems.length; i < len; i++) {
                    result = isContainElem(rootSelectionElem, rootElems[i]);
                    if (result) {
                        currentRootElem = rootElems[i];
                        break;
                    } else {
                        prevRootElems.push(rootElems[i]);
                    }
                }
                return {
                    prevRootElems: prevRootElems,
                    currentRootElem: currentRootElem
                };
            }
        }, {
            key: 'insertContents',
            value: function insertContents(selection, changes, idx) {
                //TODO -- 根据selection 通过jquery来在指定节点插入数据，用jquery来对editor-html做序列化 ,跨根节点div.root-elem的情况怎么处理
                //selection 在initClientContent时为空
                //console.log("插入字符")
                //w-e-text 里的root-elem是没有上下文context的
                var grandNode = this.editor._serialContents();
                var correctNode = void 0;
                var start = selection.start;
                var end = selection.end;
                var collapsed = selection.collapsed;
                var startContainerInfo = selection.startContainerInfo;
                var endContainerInfo = selection.endContainerInfo;
                var path = startContainerInfo.domDeep;
                var insertText = changes.inserted;
                var removed = selection.removed;
                var index = idx;

                //先获取到div.root-elem节点
                correctNode = grandNode.children()[path[0]];

                var oldhtml = this.editor.txt.html();
                var newhtml = oldhtml.substr(0, index) + insertText + oldhtml.substr(index + changes.removedLen);
                var newCorrectNode = window.jquery(newhtml)[path[0]];

                //获取到实际变化的子节点
                if (!correctNode || !newCorrectNode || grandNode.children().length !== window.jquery(newhtml).length) {
                    //TODO -- 插入新节点
                    if (insertText) {
                        var tagMatch = insertText.match(/<[^/][^>]+>/);
                        if (tagMatch[0]) {
                            window.jquery(insertText).insertAfter(window.jquery(grandNode.children().get(path[0] - 1)));
                        } else {
                            alert("添加标签，substr截取位置错误");
                        }
                    }
                    if (removed) {

                        var _tagMatch = removed.match(/<[^/][^>]+>/);
                        if (_tagMatch && _tagMatch[0]) {
                            correctNode.nextElementSibling.remove();
                        } else {
                            //1：只删除了字符。2：删除的tag标签截取错误
                            console.log("删除标签，substr截取位置", removed);
                        }
                    }
                } else if (path && path.length) {
                    for (var i = 1; i < path.length; i++) {
                        var partCorrectNode = correctNode.childNodes[path[i]];
                        var partNewcorrectNode = newCorrectNode.childNodes[path[i]];

                        //遍历时，若节点发生变更，抛弃当前节点，取共同层级的父节点操作
                        if (partCorrectNode && partNewcorrectNode) {
                            correctNode = partCorrectNode;
                            newCorrectNode = partNewcorrectNode;
                        } else {
                            break;
                        }
                    }

                    //若当前的节点是一个非空的node nodeList不为空，可以用juqery操作 $(node).html('content'),
                    //也可以通过 outerHTML操作 nodeList.outerHTML = '<label>什么情况</label>'
                    //若是文本节点#Text nodeList 为空数组，直接设置textContent childNodes["0"].textContent = "测试"
                    this.editor.selection.saveRange(); //保存选区

                    //闭合选区，只都有一个点
                    if (collapsed) {
                        //1：在空白标签里插入第一个字符，标签里有默认的<br>

                        if (newCorrectNode.nodeType === startContainerInfo.nodeType && newCorrectNode.nodeValue === startContainerInfo.nodeValue) {
                            //2：删除了旧标签，插入了新的空白标签
                            if (newCorrectNode.parentElement === null) {
                                correctNode.parentElement.innerHTML = newCorrectNode.outerHTML;
                            } else {
                                correctNode.parentElement.innerHTML = newCorrectNode.parentElement.innerHTML;
                            }
                        } else if (newCorrectNode.nodeType === startContainerInfo.nodeType) {
                            correctNode.textContent = startContainerInfo.nodeValue;
                        }
                    } else {
                        /*
                        ** FireFox和chrome下跨文本和节点的表现方式不一样，但是操作的operation是一样的
                        ** TODO -- 在不用位置，butongrange选区下插入文本的方式判断
                        */
                        //1：在共同父节点下操作了文本选区，改变样式了,删除文本，插入新文本及标签
                        if (correctNode.nodeType === 3 && newCorrectNode.nodeType === 3) {

                            var tmp = correctNode.parentElement.innerHTML;
                            //选中文本的末尾
                            if (correctNode.textContent === newCorrectNode.textContent + selection.removed) {
                                var splitpart = tmp.split(correctNode.textContent); //以整个文本为格式划分
                                tmp = splitpart[0] + newCorrectNode.textContent + changes.inserted + splitpart[1];
                                correctNode.parentElement.innerHTML = tmp;
                            } else {
                                /*中间文本中插入*/
                                var newtmp = newCorrectNode.parentElement.innerHTML;
                                var diff = getSameText(tmp, newtmp);
                                var mergeTxt = diff.samePart + changes.inserted + diff.otherparts.substr(changes.removedLen);
                                correctNode.parentElement.innerHTML = mergeTxt;
                                //correctNode.parentElement.innerHTML = tmp.substr(0,startContainerInfo.startOffset)+ changes.inserted + tmp.substr(startContainerInfo.startOffset+changes.removedLen)
                            }
                        } else if (correctNode.nodeType === 3 && newCorrectNode.nodeType === 1) {
                            /*选中开头的文本*/
                            correctNode.parentElement.innerHTML = newCorrectNode.parentElement.innerHTML;
                        } else if (correctNode.nodeType === 1 && newCorrectNode.nodeType === 1) {
                            //选中文本的新加样式与后面相同，标签合并
                            correctNode.parentElement.innerHTML = newCorrectNode.parentElement.innerHTML;
                        } else if (correctNode.nodeType === 1 && newCorrectNode.nodeType === 3) {
                            //将选中的文字，由span样式还原成normal #Text
                            correctNode.parentElement.innerHTML = newCorrectNode.parentElement.innerHTML;
                        }
                    }
                } else {
                    debugger;
                }

                this.editor.selection.restoreSelection(); //应用选区
                //更新本地版本
                this.TextOpHistroy.setCurrentValue(this.editor.txt.html());
            }
        }, {
            key: 'insertText',
            value: function insertText(index, text) {
                //来自rtcmAdapter -- applyOperation
                //console.log("insertText")
                var html = this.TextOpHistroy.currentValue;
                html = html.substr(0, index) + "" + text + "" + html.substr(index);
                this.editor.txt.html(html);
                this.TextOpHistroy.setCurrentValue(this.editor.txt.html());
                // var cm = this.wangEditor
                // var cursor = cm.getCursor()
                // var resetCursor = origin === 'RTCMADAPTER' && !cm.somethingSelected() && index === cm.indexFromPos(cursor)
                // this.replaceText(index, null, text, attributes, origin)
                // if (resetCursor) cm.setCursor(cursor)
            }
        }, {
            key: 'removeText',
            value: function removeText(index, endindex) {
                //console.log("removeText")
                var html = this.TextOpHistroy.currentValue;
                html = html.substr(0, index) + "" + html.substr(endindex);
                this.editor.txt.html(html);;
                this.TextOpHistroy.setCurrentValue(this.editor.txt.html());
            }
        }]);

        return RichTextCodeMirror;
    }();

    //生成随机数
    function getRandom() {
        return (Math.random() + new Date().getTime().toString()).substr(2);
    }

    //遍历nodeList,删除不必要的标签 数组和类数组的 nodeList、HTMLCollection
    function cleanCustromTag(nodes) {
        // nodes,可能为null，需要处理
        for (var len = nodes.length, i = len - 1; i > -1; i--) {
            var curNode = nodes[i];
            if (curNode === null || curNode === undefined) {
                return;
            }
            if (curNode.nodeType === 1) {
                //node标签
                var classstr = curNode.attributes["class"];
                if (classstr && classstr.nodeValue.match("user-bg-color")) {
                    //需要处理两种情况 1:只去掉用户选中文字的背景色 ；
                    //1:curNode <label class="user-bg-color" style="background-color:#ff4b0c">文本编</label> 
                    //这种情况需要保留文本信息  curNode.textContent '文本编'
                    var txt = curNode.textContent;
                    curNode.replaceWith(txt);
                } else if (classstr && classstr.nodeValue.match("user-cursor")) {
                    //2:去掉插入的鼠标节点
                    //<label class="user-cursor-123" style="font-size:10px......lor:#f5f5f5;left: -10px;">agtros</span></label>
                    //这种情况的node直接删除
                    curNode.remove();
                } else if (curNode.children.length) {
                    //当节点过多或层级过深时,遍历过程要优化
                    cleanCustromTag(curNode.children);
                }
            } else if (curNode.nodeType === 3) {//文本
                // 暂时不处理，部分文本样式更改，涉及到删除整个样式标签node节点
            }
        }
        return nodes;
    }

    //判断当前节点是否包含子节点
    function isContainElem(rootSelectionElem, rootElem) {
        var result = false;
        if (!rootSelectionElem || !rootElem) {
            return result;
        }
        if (rootElem === rootSelectionElem) {
            result = true;
        } else if (rootElem.childElementCount > 0) {
            for (var i = 0, len = rootElem.childElementCount; i < len; i++) {
                var rt = isContainElem(rootSelectionElem, rootElem.children[i]);
                if (rt) {
                    result = true;
                    break;
                }
            }
        } else {
            result = false;
        }
        return result;
    }

    //获取给定node的带标签的完整HTML
    function getWholeHTML(elem) {
        var tmpStr = elem.outerHTML;
        return tmpStr;
    }

    //从开始获取文本相同的部分,同时返回相同部分和，原始文本剩余部分
    function getSameText(oldValue, newValue) {
        var commonStart = 0;
        while (commonStart < newValue.length && newValue.charAt(commonStart) == oldValue.charAt(commonStart)) {
            commonStart++;
        }
        var commonEnd = 0;
        while (commonEnd < newValue.length - commonStart && commonEnd < oldValue.length - commonStart && newValue.charAt(newValue.length - commonEnd - 1) == oldValue.charAt(oldValue.length - commonEnd - 1)) {
            commonEnd++;
        }

        var removed = oldValue.substr(commonStart, oldValue.length - commonStart - commonEnd);
        var inserted = newValue.substr(commonStart, newValue.length - commonStart - commonEnd);

        var samePart = oldValue.substr(0, commonStart);
        var otherparts = oldValue.substr(commonStart);

        return { samePart: samePart, otherparts: otherparts };
    }
    //获取当前node在nodeList中的位置,若是空标签，child === parent
    function getNodeIndex(child, parent) {
        var index = 0;
        if (child && parent) {
            index = Array.prototype.indexOf.call(parent.childNodes, child);
            if (index < 0) {
                index = child === parent ? 0 : -1;
            }
        }
        return index;
    }

    /**
     **获取当前根节点下字符的长度 对于空白标签range的startOffset=0，
     **若鼠标点击在图片后 startoffset=endOffset=1，
     ** 即图片只当成来长为1的元素，需要手动处理img的src和标签
    // TODO --嵌套的node 需要判断到实际位置，不能单纯判断nodetype和deep <p>1{|}}<span>22</span>1{|}<p> 1后的limitOpt是一样的，导致取值一样
    // TOFix node.previousSibling, previousSibling.parentElement.previousSibling.parentElement 这种递归，找到完整的节点，在截取字符
    **/
    function getCharByJsonTree(rootElem, limitOpt) {
        var size = 0;
        var tmpStr = "";
        var deep = 1;
        var breakStatus = false;
        var limitOpt = limitOpt;
        //获取标签的前半部分html
        function getFirstPart(elem) {
            var tag = elem.nodeName.toLocaleLowerCase();
            var attrs = elem.attributes;
            var tmpStr = '';
            if (elem.nodeType === 1) {
                //遍历到文本节点
                tmpStr += '<' + tag;
                for (var j = 0, len = attrs.length; j < len; j++) {
                    tmpStr += ' ' + attrs[j].nodeName + '="' + attrs[j].nodeValue + '"';
                }

                //类似</br> 以及可闭合也可以不闭合的标签<img /> <img>
                if (unCloseTag.indexOf(tag) > -1) {
                    tmpStr += '>';
                } else {
                    tmpStr += '>';
                }
            }
            return tmpStr;
        }

        function elemMap(rootElem, deep, index) {
            //TOFix -- 可能直接点到 div.root-elem上了 导致能取到.root-elem的index，却没有点击到p.section
            // 这时deep只有1层

            var val = deep.shift();
            if (val !== undefined) {
                var nodeLists = rootElem.childNodes;
                var temp = "";
                for (var i = 0; i < val; i++) {
                    var item = nodeLists[i];
                    if (item.nodeType === 1) {
                        temp += item.outerHTML;
                    } else if (item.nodeType === 3) {
                        temp += item.textContent;
                    }
                }
                var _last = nodeLists[val];
                var str = getFirstPart(rootElem);
                tmpStr += str + temp;
                elemMap(_last, deep, index);
            } else if (!val) {
                if (rootElem.nodeType === 1) {
                    tmpStr += getFirstPart(rootElem);
                } else if (rootElem.nodeType === 3) {
                    tmpStr += rootElem.nodeValue.substr(0, index);
                }
            } else {
                //层级遍历完，跳出递归
                return;
            }
        }

        //存在节点查找限制信息的，需要取遍历节点，否则直接去取完整节点
        if (limitOpt) {
            if (limitOpt.domDeep && limitOpt.domDeep.length > 0) {
                //数组要重新拷贝一份
                var _deep = [].concat(limitOpt.domDeep).splice(1);
                var index = limitOpt.startOffset;
                elemMap(rootElem, _deep, index);
            } else {
                console.log("domDeep 层级深度错误");
            }
        } else {
            tmpStr += rootElem.outerHTML;
        }
        return tmpStr;
    }
});