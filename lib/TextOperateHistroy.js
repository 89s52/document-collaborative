//histroy 记录文本操作历史
'use strict'

module.exports = class TextOperateHistroy {
	constructor(cm) {
		this.currentValue = cm.getCleanHtml();
		this.currentIndex = 0;
		this.changed = false; //状态机，为true时不做文本变化的判断操作直接返回null
		this.changes = [];
		/*changes参数 [
		{start: start, //开始位置
		end: start, //结束位置
		text: text, //当前操作变化的文本
		origin: origin //操作源-编辑器，鼠标，键盘，区分操作事件
		type：'retain' //retain(10),delete(1),insert("阿凡达") 操作类型：保留多少位，删除多少，插入来什么字符，每次转换都是基于最新文本来说的。
		}]*/
		this.range = { //鼠标选取存在跨越节点的情况
			startOffset:0, //选区开始位置
			endOffset:0, //选区结束位置
			startContainer:{ //开始的选区
				domName:'',  //节点名称
				domType:'',  //节点类型，1：dom，3：#text
				domDeep:''   //节点层级
			},
			endContainer:{ //结束的选区
				domName:'',
				domType:'',
				domDeep:''
			}
		};
		this.versions = 0; //本地操作序号，自增,与服务端versions比对，合并多余操作;
	}
	updateOperateHistroy(operation,range){
		if(operation && range){
			this.changes.push(operation);
			this.range = range;
			++this.versions;
		}else{
			console.log(`当前操作，存储的历史记录参数不全`);
		}
	}
	textChange(oldValue, newValue) {
		var commonStart = 0;
		while (commonStart < newValue.length &&
			newValue.charAt(commonStart) == oldValue.charAt(commonStart)) {
			commonStart++;
		}
		var commonEnd = 0;
		while (commonEnd < (newValue.length - commonStart) &&
			commonEnd < (oldValue.length - commonStart) &&
			newValue.charAt(newValue.length - commonEnd - 1) ==
			oldValue.charAt(oldValue.length - commonEnd - 1)) {
			commonEnd++;
		}

		var removed = oldValue.substr(commonStart, oldValue.length - commonStart - commonEnd);
		var inserted = newValue.substr(commonStart, newValue.length - commonStart - commonEnd);
		if (!(removed.length || inserted)) {
			return null;
		}

		return this.setOperate(newValue, commonStart, commonEnd, removed, inserted, removed.length, newValue.length);
	}
	setCurrentValue(newvalue) {
		this.currentValue = newvalue;
	}
	setOperate(str, start, end, removed, inserted, delen, total) {
		this.currentValue = str;
		return {
			start: start + delen,
			end: total - end,
			removed,
			inserted,
			delen
		}
	}
	getDelta(html) {
		var _this = this;
		let delta;
		//可能的文本变化情况
		//1：只增加，2：只删除，3：添加的比删除的多（显示为添加操作），
		//4：添加的比删除的少（显示为删除操作）5：添加删除一样（修改，根据响应按键的情况，若时间太短，可能不会响应）
		///operateType: 'add' 增加 'delete' 删除，'modify' //修改
		let operateState = {
			startOffset: 0,
			endOffset: 0,
			contents: '',
			operateType: '',
			baseLength : this.currentValue.length,
			targetLength: html.length
		}
		if (this.changed) {
			return null;
		}
		delta = this.textChange(this.currentValue, html);
		//console.log(delta)
		if (delta) {
			operateState.contents = delta.inserted
			operateState.operateType = "add"
			operateState.startOffset = delta.start
			operateState.endOffset = delta.end

			if (delta.delen > 0) {
				operateState.contents = delta.inserted
				operateState.operateType = "modify"
			} else if (delta.start < delta.delen) {
				operateState.contents = delta.removed
				operateState.operateType = "del"
			} else {
				operateState.contents = delta.inserted
				operateState.operateType = "add"
			}
		}
		console.log(operateState)
		return operateState
	}
}