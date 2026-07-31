---
title: "yjj某数后缀生成（1-15，js逆向）"
author: "成功你要成仁啊"
date: "于 2022-01-15 12:56:40 发布"
source: "https://blog.csdn.net/weixin_44772112/article/details/122507622?spm=1001.2014.3001.5502"
images: "17 张 (原始URL)"
---

```bash
目标网站：aHR0cHM6Ly93d3cubm1wYS5nb3YuY24vZGF0YXNlYXJjaC9zZWFyY2gtcmVzdWx0Lmh0bWw=
```



**看这篇文章的前提是：读者已经成功请求到了200页面**



**一、抓包分析**

打开F12，首先映入眼帘的是无限debugger，这是那三个经过ob混淆过的做的手脚，这里我是用本地替换的方法过的（即找到启动debugger的函数然后把他删掉），在文末我会放出那三个js的代码（util.js、api.js、ajax.js）



然后需要解决的是某数独有的debugger,下面是解决方法



![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/d5c3e4cb410cc35f09e3952ce6f4deaf.png)




![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/1d88d2fbd4383dde63a07817f9b2c9af.png)




把这些反调过了之后就开始真正的抓包分析需要的参数了



![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/5103836e4cff1006f0cb54d7115a5c77.png)


可以看到有三个参数是过的（sign、hKHnQfLv、8X7Yi61c），那就先看的sign，第一个解决了通过一些蛛丝马迹找到另外两个参数的加密位置



**二、跟栈分析**

**sign参数生成：**



先打个xhr断点



![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/71ce849f61df6d78003b8c34aaa8fb8b.png)


然后刷新一下，跟到箭头所指的位置



![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/75a96db394ae409d7a73d949b02d09ab.png)


在sign这行打个断点再刷新一下，进到jsonMD5ToStr方法里，可以看到这是个平坦流，直接在return处下断，**就可以知道其实他是对所请求的url进行了encodeURIComponent操作然后再MD5一下（经过测试该加密没有经过魔改）**



![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/7e8d08ea920131c0b3eafb8c99661c28.png)


sign参数解决后我们来看下剩下两个比较重要参数



**hKHnQfLv、8X7Yi61c参数生成：**



回到一开始下断的地方



![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/ae72b032c80731a385c51d2dfc2bbf73.png)


**这个this是XMLHttpRequest，现在很多站都喜欢对XMLHttpRequest.send和XMLHttpRequest.open进行暗改，从而让我们很难找到加密参数生成的位置（比如某数，某音）**



那我们在控制台打印验证一下



![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/8e8648b6cbd9f0099499aeeffc8a05d3.png)


这里的话，他是在XMLHttpRequest.open做手脚的，我们直接跟进来下断





![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/b589f35034ee23bed94b71247488be7d.png)




可以看到原始数据经过_$45后，就有hKHnQfLv、8X7Yi61c了，我们继续跟进去看看



![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/2132778ebb4b17b6653958d2ddfa065a.png)


上图中红色框部分都是对url进行了一些判断操作（如果你的采集接口只有一个的话可以写死）



下面这句是对url进行一个toUpperCase操作，再通过HD方法生成16位数组，这个方法在生成200页面的时候用到所以不用扣



```bash
var _$L0 = _$HD(_$pi(_$6X(_$oa._$Gl + _$4p)));
```



然后携带刚才生成的16位数组进入生成 hKHnQfLv 的方法里



![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/17973e111135fbccf2eb959c372924a1.png)


下面是这个方法的具体解释



```bash
function _$Sb(_$P7, _$2o) {  //_$2o是上面所生成的16位数组
    var _$DP = [];
    var _$jJ = '';
    var _$4p = _$J7(_$7b()); //这里生成32位数组，这两个方法在生成200页面的时候都用到 不用扣
    _$DP = _$DP[_$6_[1]](_$2o, _$P7, _$4o || 0, _$4p); //这里将16位数组和32位数组拼接 生成50位数组
    var _$L0 = _$14(744, 6, true, _$DP);  //将50位数组传入生成hKHnQfLv
    var _$Vo = _$Ow + _$L0;
    _$ca = _$RD(_$k$(_$Vo), 2);  //跟8X7Yi61c有关
    return _$QZ[_$6_[5]](_$jJ, _$Eu, _$6_[6], _$Vo);
}
```



我这里就不跟进_$14方法再演示了，因为这个方法就是生成200页面的逻辑

这是跟完128位数组后面的操作截图



![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/3e24099c340e485c43baab7ab5ee80ce.png)




继续，我们跳出_$14方法，下面这句代码注意，这两个方法需要去扣，200页面的逻辑没用到



```bash
_$ca = _$RD(_$k$(_$Vo), 2);  //这里根据生成hKHnQfLv后的值经过两个方法生成一个字符串，这很重要 因为8X7Yi61c的生成跟这个小小的字符串有关
```



**到此 hKHnQfLv 参数已经完毕**，我们然后跳出_$Sb方法，来到这



![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/f9e56369f6ca2309be44f8596a91384c.png)


箭头所指的就是生成 8X7Yi61c 的函数，跟进去



![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/bc47d2f0b06b288908ef8d46ddf1d373.png)


跟进来后可以看到他先给url加了点东西，然后Bg方法就是生成8X7Yi61c的，继续跟进来



![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/81e0562e5266fb0a46da46678cb34de8.png)


**这里的_3V是需要自己扣的，里面需要用到window.ts的东西（第19个），还有_3V是需要自己扣的，里面需要用到window.ts的东西（第19个），还有_6w方法也是需要扣的，这几个方法都是相对独立的，跟其他方法没有什么关联，所以比较好解决**



其他的一些小细节只能靠你们自己去踩坑了，篇幅太长了，不想写了溜了溜了



**三、请求验证**





![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/fbd0a98feb50cda6314c0e1ba4c4f0a8.png)

---
> 原文链接: [yjj某数后缀生成（1-15，js逆向）](https://blog.csdn.net/weixin_44772112/article/details/122507622?spm=1001.2014.3001.5502)
> 作者: 成功你要成仁啊
> 图片: 0/17 张已内嵌
