 >copy from http://apsay.com/wap/index-wap.php?p=1625
 React的核心是Virtual DOM和Synthetic Events。Virtual DOM可以理解为在JavaScript用一组对象虚拟实现了一套文档对象模型，Virtual DOM对应DOM。同理，Synthetic Events对应DOM events。
# React Nodes React虚拟DOM节点:
ReactElement
ReactText (string and number)
ReactFragment (Array of ReactNodes)

虚拟DOM树的实现，是通过ReactElement对象的属性方式，子节点对象都是父节点对象的属性值。
一个ReactElement对象就是一个DOM Element在JavaScript中的虚拟再现。ReactElement对象在创建后是轻量的，无状态的，不可变的。
    ReactElement对象的props属性值是一个键值对形式的集合对象。它部分对应的是DOM Element的属性和属性值。要在最终HTML标签上显示的自定义属性名字要求和W3C规范一样，必须有
"data-"前缀。每个ReactElement对象创建时，React都会给它的props里自动添加一个名为data-reactid的自定义属性，它的值是这个元素在虚拟DOM中的唯一标识ID。并不是所有props 
object里的属性都会一一创建为DOM Element的属性，只有符合W3C规范的属性名，比如HTML元素的属性和加了"data-"，"aria-"前缀的属性才会在DOM Element标签上显示出来。props object
有一个children的属性，它是一个ReactElement对象拥有的其他ReactElement对象的集合,这个属性就不会出现在最终的HTML标签里面。

class and for虽然是HTML元素的属性名，但是因为是JavaScript的保留关键字，所以必须用className and htmlFor替代，React会正确转换成标准属性名显示在最终的HTML标签中。

props对象里的style属性的值也是一个键值对形式的集合对象。它的属性名支持所有CSS属性，只是要采用camelCased命名法，最终React也会正确转换成CSS标准属性名。属性值的要求和CSS规范一致。

ReactElement对象的ref属性值是一个回调函数，函数有一个参数就是ReactElement对象对应的native browser DOM element。

# 创建ReactElement对象要使用React.createElement方法。

* `React.DOM`对象内置了快速创建特定ReactElement对象的方法，方法名和DOM HTML Element名一样。比如像创建一个虚拟的div元素，使用`React.DOM.div()`方法。

* 当需要快速批量的创建一组ReactElement对象或者根据数据的不同创建不同ReactElement对象时，需要使用`ReactClass`对象。根据ReactClass对象创建的ReactElement对象也叫做`React Component组件`。
* React Component是基于ReactElement对象的概念，它是对一个ReactElement对象，它可能拥有其他ReactElement对象，以及和这些对象相关的数据和行为的封装。
* ReactClass对象是拥有React Components Constructors的包装器wrappers。它的原型对象是React.Component对象。 
* 可以用React.createClass方法创建ReactClass对象。**因为ReactClass对象只是拥有Constructors的wrappers，不要用new ReactClass的方式创建组件实例instances。使用React.createElement方法获得React Component的ReactElement对象。**
* 在ECMAscript新规范中新加了基于类编程的syntactic sugar句法糖。React也提供这种实现方式，可以不用React.createClass方法，而是用extends React.Component的方式创建一个ReactClass对象。

> 注意，所有基于类syntactic sugar句法糖实现的ReactClass对象，属性方法都没有自动绑定this。No Autobinding。请在需要的地方显式绑定this为ReactClass对象。

* `React.createClass`方法的参数是一个对象，这个对象必须有一个名为`render`的属性，这个属性值是个函数，函数返回值必须是一个`ReactElement`对象，它可以拥有其他`ReactElement`对象。

## React.createElement方法的参数说明：
1. 第一个参数，HTML Elements Name HTML元素名（加引号的字符串）或者ReactClass对象（通常是指向此对象的变量名，首字母大写）；
2. 第二个参数，可选，properties属性集合（通常是key-value pairs形式的属性对象或者指向此对象的变量名，作为根据第一个参数创建的元素的属性，可以传null）；
3. 后面是不定数可选参数，children 0个以上元素(全部是兄弟元素，父元素是根据第一个参数创建的元素)。

HTML tags are used to delimit the start and end of elements in the markup. Tags contain a tag name, giving the element's name.

* `React.DOM`对象的HTML元素名方法的参数就是去掉`React.createElemen`方法的第一个参数，之后参数要求一样。
* 另一种快捷创建ReactElement对象的方法是`React.createFactory`方法，`React.createFactory`方法只接受一个参数，和`React.createElement`方法的第一个参数要求一样，返回一个生成器函数auto-generated factory function，这个生成器的使用和`React.DOM`对象的HTML元素名方法一样。

# ReactDOM
* `ReactDOM`对象是用来操作DOM的，包括virtual DOM和actual DOM。有了ReactElement对象或者组件后，就需要使用`ReactDOM.render`方法来把它们加入到virtual DOM和actual DOM。
* ReactDOM.render方法有三个参数，第一个是ReactElement对象；第二是DOM容器节点container node；第三个是虚拟元素对应的DOM元素创建成功后的回调函数，可选参数。
  使用ReactDOM.render方法的时候，并不一定就会操作actual DOM，render方法做了很多事情，它会检查传入的ReactElement，是不是已经存在于虚拟DOM，如果已经存在，有没有所不同等等。
  当一个ReactElement对象第一次作为参数传入ReactDOM.render方法时，React会把该对象加入到虚拟DOM Tree中，并且在真实DOM中新建对应的native browser DOM element，然后返回该DOM Element的引用。返回有例外情况，后面说。


> 注意：
> `ReactDOM.render()`管理你传入的DOM容器节点的内容。在第一次调用的时候，所有这个容器节点内现存的DOM元素都会被替换掉。之后的调用会比较不同后更新不同的部分。
> `ReactDOM.render()`不修改容器节点本身，只修改容器节点的子节点。在将来，可能只是把新的DOM Element添加到现存子节点之后，而不动现存子节点。

如果只是想获得ReactElement对象对应的ative browser DOM element的HTML markup字符串，可以通过`ReactDOMServer`对象。

一般约定，构造器对象Constructors的变量名，首字母大写。实例instances的变量名，首字母小写。示范代码：
```js
var MyComponentClass = React.createClass({/*...*/});
var myComponentElement = React.createElement(MyComponentClass);
ReactDOM.render(myComponentElement, document.getElementById('example'));
```
所有使用React.createElement方法的地方，都可以替换成JSX形式。比如前面的示范代码:
```js
var myComponentElement = React.createElement(MyComponentClass);
//替换成
JSXvar myComponentElement = ;
```

JSX is a XML-like syntax extension to ECMAScript without any defined semantics. 会写XML就会写JSX。

* 由于JSX最终会被React转换成JavaScript代码执行，所以不要在JSX中使用JavaScript的保留关键字Reserved Words作为标签名和属性名，`ReactClass`的标签名也不要使用HTML标签名，也就是在创建`ReactClass`的时候，`ReactClass`的变量名就不要使用JavaScript Reserved Words和HTML Element's Name。
* 因为`ReactClass`变量名首字母大写，自然对应的JSX自定义标签名也一样，而用`React.createElement`方法创建对应HTML元素的虚拟HTML元素时，就是使用HTML元素名，所以对应的JSX标签名也直接使用HTML标签名。
* 在JSX中可以直接写HTML Entities，转义字符串（Escape Sequence）也称字符实体(Character Entity)。需要注意的是如果是在花括号里则会按JavaScript 字符串处理。

组件的`displayName`属性是用来调试的，如果没有赋值，在JSX中会自动赋一个值。

The JSX expression always evaluates to a ReactElement. JSX表达式的值是一个`ReactElement`。和`React.createElement`方法的返回值一样，JSX编译后就是一堆`React.createElement`方法。

Namespaced Components命名空间组件。ReactClass对象的属性可以是另一个ReactClass，这个ReactClass属性被认为是ReactClass对象的子组件。可以通过属性访问器的形式作为`React.createElement`方法第二个参数后面的不定参数使用。同理可以用于JSX的标签名。

* 在JSX中使用JavaScript，用花括号把JavaScript代码括起来就可以，但是并不是所有JavaScript代码都能在转换后有效执行。

`Attribute Expressions`，用于`React.createElement`方法第二个参数的属性对象里，key冒号后可以使用表达式。在JSX中，属性名的等号后面用花括号把表达式括起来。
`Boolean Attributes` ，JSX基本实现了HTML的语法规则，所以属性值是Boolean类型的情况，规则和HTML一样。如果要显式赋值，请在属性名的等号后面用花括号把Boolean值括起来。
`Child Expressions`，在`React.createElement`方法的最后的不定数参数，可以使用值是ReactElement的表达式。在JSX中用花括号把表达式括起来。
`Comments`，在JSX中用花括号把注释括起来。

`React.createElement`方法第二个参数的属性对象，可以在方法调用前，先创建好这个对象，并作为参数传入。在JSX中，可也在写属性的地方使用这个对象，并且改变对象的数据，需要JavaScript代码，比如使用spread operator，因为扩展运算符只有用于可遍历对象才有效，说明props是个可遍历对象iterable object。示例代码：
```js
var MyComponentClass = React.createClass({/*...*/});
var props = { foo: 'default' };
var myComponentElement = ;
console.log(myComponentElement.props.foo); // 'override'
```
在ReactClass对象中定义一个名为getDefaultProps的方法，可以给这个组件配置默认的props数据。

React.PropTypes对象输出一系列验证器，它能用来确保组件收到的props数据是通过了校验的。当props对象的某个属性不能通过验证器时，JavaScript console将显示一个警告。React.PropTypes对象在ReactClass对象中定义，它是ReactClass对象的一个名为propTypes的属性。

如果是基于类syntactic sugar句法糖实现的ReactClass对象，在类声明后，直接使用类属性的方式给defaultProps和propTypes属性赋值即可。

# Interactivity and Dynamic UIs，交互和动态UI的实现。

* 最基本的实现，首先为`ReactClass`对象实现一个名为`getInitialState`方法，方法返回值必须是一个键值对形式的集合对象。ReactClass对象的其他属性方法里面，可以通过`this.state`访问`getInitialState`方法创建的对象。`render`方法里面可以根据`state`的数据来创建`ReactElement`，这就实现了Dynamic虚拟元素，进一步也就实现了Dynamic UIs。当然只有`state`数据是动态的，元素才是动态。改变`state`的数据，可以在`ReactClass`对象里定义操作`state`数据的函数，函数内调用`this.setState`方法，这个函数可以是服务器驱动，或者用户驱动。用户驱动则就实现了交互。一般是把虚拟元素的交互行为属性赋值为操作数据的函数的引用，React并没有把函数绑定到最终实际的DOM元素上，所有的函数管理都是在React内完成。

* 注意如果是基于类syntactic sugar句法糖实现的ReactClass对象，不用写getDefaultProps的方法，直接在constructor构造函数中，使用this.state赋值即可。

`this.state`属性对外是只读，不可写的。只能通过`setState`方法Performs a shallow merge of nextState into current state.而且使用setState方法加入state新数据，也不是即时的，而是加入缓存中，只有当访问`this.state`时用到了新加入的数据时，才会正式并入。

* 没有state数据的组件也叫做无状态组件stateless component。一般来说，除了给`state`赋值的那个容器组件，它包含的组件都是无状态的，它们都不应该直接通过`this.state`来获得数据，而是通过拥有`state`数据所有权的容器组件传递的`props`对象来获得数据。这种关系叫做`owner-ownee relationship`，这种数据传递叫做`data flows from owner to owned`。

* 如果是无状态组件`stateless component`，`ReactClass`对象可以通过一个普通函数创建，这种函数叫做`stateless functions`。通常使用箭头函数的形式。

* 如果是`stateless components`则`ReactDOM.render`方法返回null。对应`ReactDOM.render`方法，`ReactDOM.unmountComponentAtNode`方法是用来移除`Stateful Components`。除了`ReactDOM.rende`r方法会返回`stateless components`对应的`native browser DOM element`外，还可以通过`ReactDOM.findDOMNode`方法获得。

* 无状态组件要想获得对应的DOM Elementls，只能通过ref属性。

* 在React机制里，所有DOM元素的显示都应该是通过对应的虚拟DOM元素渲染实现，并且`ReactElement`的显示数据都来自容器组件的`props`对象。
# 虚拟表单元素
* 通过给虚拟表单元素的`props`对象的`value`属性赋值一个非null的值，React就会控制DOM的表单文本元素的用户输入显示。这种控制权被`React`接管的组件叫做`Controlled Components`。接管控制权的方式是把DOM原生事件`nativeEvent`委托delegation给React的`SyntheticEvent`。

input and textarea是通过DOM's built-in oninput event handler。checkbox and radio inputs是通过DOM's built-in click event handler。

如果不想React控制DOM表单文本元素，只要不给value赋值，或者赋值为null即可，这种组件叫做Uncontrolled Components。如果想给表单一个默认值，但又不想控制它，可以通过props对象的defaultValue或者defaultChecked属性赋值实现。

# Component Lifecycle
Component Lifecycle组件生存期的概念依赖于`ReactDOM.render`方法和`虚拟DOM`。组件生存期有三个关键时间点，第一个是诞生日Mounting，第二个是活动日Updating，第三个是死亡日Unmounting。

* Mounting，当组件第一次传入`ReactDOM.render`方法时，则成为虚拟和真实DOM Tree的一个Node。这个时间点会依次调用组件的几个方法，如果是状态组件，首先会调用getInitialState(): object，然后是componentWillMount()和componentDidMount()。

* Updating，只有状态组件才有的时间点，当组件的`this.setState()`方法被调用或者组件被再次传入`ReactDOM.render`方法时会触发这个事件。可能会依次调用这些方法`componentWillReceiveProps(object nextProps)` `shouldComponentUpdate(object nextProps, object nextState): boolean` `componentWillUpdate(object nextProps, object nextState)` `componentDidUpdate(object prevProps, object prevState)` 。如果是composite components，还可能会调用`component.forceUpdate()`。

* Unmounting，组件从DOM中被移除和销毁前，调用`componentWillUnmount()`。

为了让不同组件可以共享一些功能。在`ReactClass`对象中定义一个名为`mixins`的属性，值是数组，数组内的数据，是拥有特定方法的对象。如果一个`ReactClass`对象的`mixins`数组有多个功能对象，并且它们定义了相同的lifecycle methods，都会执行，按数组顺序执行。注意如果是基于类syntactic sugar句法糖实现的`ReactClass`对象还不能支持`mixins`。

# React插件是一组工具模块集合。

* React动画插件`require('react-addons-css-transition-group')`本身并不实现动画，动画还是靠CSS，它提供一组方法按时间来管理组件的类名，可以指定某个组件什么时间添加什么CSS类名，并且保持多长时间，再移除或者更换其他CSS类名。

* React双向绑定插件`require('react-addons-linked-state-mixin')`，ReactLink is just a thin wrapper and convention around the onChange/setState() pattern，它是基于`mixins`特性实现的，在`LinkedStateMixin`对象里面，有一个`linkState`的方法。

* React调试工具插件·require('react-addons-test-utils'·)，·ReactTestUtils.Simulate·对象可以模拟触发一个DOM Element事件进行测试，这样就可以不需要浏览器和用户交互行为来触发事件。另外还有很多工具对象。。。

* `ReactFragment`插件`require('react-addons-create-fragment')`，它的作用是为了在不触发DOM的unmount和remount事件前提下调整已经Mounted装载的组件。通过类似`createFragment`方法把已装载组件归为一块，虽然参数是key-value形式的对象，但是最终是数组形式保存。Array createFragment(object children) 。JSX使用x:frag标签形式。

至于Flux和Redux，如果有过MVC框架的使用经验就好理解了。

# 原则
> Remember that code is read far more than it's written. As you start to build large libraries of components, you'll appreciate this explicitness and modularity, and with code reuse。

学会读优秀代码，比忙着写，远远重要的多。

怎样才是优秀的代码？明确清晰。而怎样才能写出明确清晰的代码？思路清晰，逻辑清楚，语句直白不晦涩的人，自然能写出明确清晰的代码，代码自然是模块化可复用。

HTML规范就是讲应该怎么建立web文档结构，如果产品经理在设计产品结构时也能把HTML规范考虑进去，后面的UI设计师到前端工程师在工作时都会容易很多。

数据导向，一般来说都是内容决定形式，只有保证内容有效传达给受众后，才会考虑那些形式的花边。

先给幕后的数据建模，把内在数据模型映射到界面组件上。

single responsibility principle, that is, a component should ideally only do one thing.
职责单一原则 SRP，一个组件应该只做一件事。

* hierarchy 层次结构

从最小组件开始搭建视图层级结构，明确嵌套关系，确定终端组件和分组容器类组件。

先建立React单向数据流的静态文档，使用props实现。

在静态文档的基础上，建立反向数据流，实现交互逻辑，使用state实现。

state的要求，absolute minimal 绝对最小化，DRY: Don't Repeat Yourself 没有冗余。

找到交互的源头，找到会改变幕后数据的终端组件，找出会引发改变的根本性数据作为state的记录项。一切可以通过其他数据计算获得的，都不作为state。

state的初始化位置，一般在所有会被这个state集合影响的组件最外层的容器组件那里。

state初始化完成后，建立监听处理函数，watch and update state。

React的流程要求，所有因为交互而导致显示改变，都必须从终端组件传递到state所在外层组件，更新state后，再从外层组件传回终端显示。

https://facebook.github.io/react/docs/thinking-in-react.html

从react网站凌乱而简陋的文档也能感觉到react正处于高速发展的初期。

React期望目标和目的是，可以让开发者在JavaScript中完成所有文档的处理，它希望接管所有关于文档结构和事件的操作，虽然很难，但差不多也做到了，因为JavaScript解释器引擎要比web文档解析器引擎高效太多，所以react也不太希望开发者在react中有直接操作文档DOM和DOM Event的情况，如果有那就是react认为不好的实践，或者是react还做的不好。这也说明如果使用react，其实就没有使用jquery的太大必要。不过react并没有解决文档样式的问题，所以还是需要配合CSS解决方案。

话说React生态系统大有把所有web前端开发工作都在JavaScript中完成的抱负。比如CSS in JS Radium [1]。但这只是解决了怎么高效写CSS的问题，至于怎么把视觉稿完美转换成CSS，怎么适应无数尺寸的屏幕等，还是得靠Bootstrap，Radium Grid之类的方案。

推荐Radium，因为它的Mechanism是Pure inline styles。google developers说了Inline render-blocking CSS是解析效率最高的。
