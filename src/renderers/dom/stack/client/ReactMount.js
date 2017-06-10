/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactMount
 */

'use strict';

var DOMLazyTree = require('DOMLazyTree');
var DOMProperty = require('DOMProperty');
var React = require('React');
var ReactBrowserEventEmitter = require('ReactBrowserEventEmitter');
var ReactCurrentOwner = require('ReactCurrentOwner');
var ReactDOMComponentTree = require('ReactDOMComponentTree');
var ReactDOMContainerInfo = require('ReactDOMContainerInfo');
var ReactDOMFeatureFlags = require('ReactDOMFeatureFlags');
var ReactFeatureFlags = require('ReactFeatureFlags');
var ReactInstanceMap = require('ReactInstanceMap');
var ReactInstrumentation = require('ReactInstrumentation');
var ReactMarkupChecksum = require('ReactMarkupChecksum');
var ReactReconciler = require('ReactReconciler');
var ReactUpdateQueue = require('ReactUpdateQueue');
var ReactUpdates = require('ReactUpdates');

var getContextForSubtree = require('getContextForSubtree');
var instantiateReactComponent = require('instantiateReactComponent');
var invariant = require('invariant');
var setInnerHTML = require('setInnerHTML');
var shouldUpdateReactComponent = require('shouldUpdateReactComponent');
var warning = require('warning');
var validateCallback = require('validateCallback');
/**
 * DOMProperty.ID_ATTRIBUTE_NAME='data-reactid'
 * @type {string}
 */
var ATTR_NAME = DOMProperty.ID_ATTRIBUTE_NAME;
var ROOT_ATTR_NAME = DOMProperty.ROOT_ATTRIBUTE_NAME;
//DOM nodeType属性
/**
 * 元素节点nodeType=1,如div。
 * @type {number}
 */
var ELEMENT_NODE_TYPE = 1;
/**
 * document.nodeType = 9;
 * @type {number}
 */
var DOC_NODE_TYPE = 9;
/**
 * document.createDocumentFragment().nodeType=11
 * @type {number}
 */
var DOCUMENT_FRAGMENT_NODE_TYPE = 11;

var instancesByReactRootID = {};

/**
 * Finds the index of the first character
 * that's not common between the two given strings.
 *
 * @return {number} the index of the character where the strings diverge
 */
function firstDifferenceIndex(string1, string2) {
  var minLen = Math.min(string1.length, string2.length);
  for (var i = 0; i < minLen; i++) {
    if (string1.charAt(i) !== string2.charAt(i)) {
      return i;
    }
  }
  return string1.length === string2.length ? -1 : minLen;
}

/**
 * @param {DOMElement|DOMDocument} container DOM element that may contain
 * a React component
 * @return {?*} DOM element that may have the reactRoot ID, or null.
 */
function getReactRootElementInContainer(container) {
  if (!container) {
    return null;
  }

  if (container.nodeType === DOC_NODE_TYPE) {
    return container.documentElement;
  } else {
    return container.firstChild;
  }
}

function internalGetID(node) {
  // If node is something like a window, document, or text node, none of
  // which support attributes or a .getAttribute method, gracefully return
  // the empty string, as if the attribute were missing.
  return node.getAttribute && node.getAttribute(ATTR_NAME) || '';
}

/**
 * Mounts this component and inserts it into the DOM.
 * 递归挂载组件返回markup，并将markup插入container
 * @param {ReactComponent} componentInstance The instance to mount.
 * @param {DOMElement} container DOM element to mount into.
 * @param {ReactReconcileTransaction} transaction
 * @param {boolean} shouldReuseMarkup If true, do not insert markup
 */
function mountComponentIntoNode(
  wrapperInstance,
  container,
  transaction,
  shouldReuseMarkup,
  context
) {
  var markerName;
  if (ReactFeatureFlags.logTopLevelRenders) {
    var wrappedElement = wrapperInstance._currentElement.props.child;
    var type = wrappedElement.type;
    markerName = 'React mount: ' + (
      typeof type === 'string' ? type :
      type.displayName || type.name
    );
    console.time(markerName);
  }
  //调用ReactCompositeComponent中的mountComponent方法来渲染组件，调用后返回React组件解析的HTML，
  //不同的ReactComponent的mountComponent策略不同，可以看做多态。
  // <h1>Hello, world!</h1>, 对应的是ReactDOMTextComponent，最终解析成的HTML为
  // <h1 data-reactroot="">Hello, world!</h1>
  var markup = ReactReconciler.mountComponent(
    wrapperInstance,
    transaction,//一个事务实例执行的时候，不能再次执行一个事务。它是ReactReconcileTransaction的实例。
    null,
    ReactDOMContainerInfo(wrapperInstance, container),
    /*
    控制台输出：
     {
     _hostContainerInfo:Object
     _ancestorInfo:Object
     _idCounter:14
     _namespaceURI:"http://www.w3.org/1999/xhtml"
     _node:div#root
     _ownerDocument:document
     _tag:"div"
     _topLevelWrapper:ReactCompositeComponentWrapper
     __proto__:Object
     }
     */
    context,
    0 /* parentDebugID */
  );

  if (markerName) {
    console.timeEnd(markerName);
  }

  wrapperInstance._renderedComponent._topLevelWrapper = wrapperInstance;
  //将解析出来的HTML插入DOM中
  ReactMount._mountImageIntoNode(
    markup,
    container,
    wrapperInstance,
    shouldReuseMarkup,
    transaction
  );
}

/**
 * Batched mou
 * 以事务形式执行
 * @param {ReactComponent} componentInstance The instance to mount.
 * @param {DOMElement} container DOM element to mount into.
 * @param {boolean} shouldReuseMarkup If true, do not insert markup
 */
function batchedMountComponentIntoNode(
  componentInstance,
  container,
  shouldReuseMarkup,
  context
) {
  var transaction = ReactUpdates.ReactReconcileTransaction.getPooled(
    /* useCreateElement */
    !shouldReuseMarkup && ReactDOMFeatureFlags.useCreateElement
  );//得到事务实例
  transaction.perform( //以事务形式执行mountComponentIntoNode
    mountComponentIntoNode,
    null,
    componentInstance,
    container,
    transaction,
    shouldReuseMarkup,
    context
  );
  ReactUpdates.ReactReconcileTransaction.release(transaction);// 释放事务实例
}

/**
 * Unmounts a component and removes it from the DOM.
 *
 * @param {ReactComponent} instance React component instance.
 * @param {DOMElement} container DOM element to unmount from.
 * @final
 * @internal
 * @see {ReactMount.unmountComponentAtNode}
 */
function unmountComponentFromNode(instance, container) {
  if (__DEV__) {
    ReactInstrumentation.debugTool.onBeginFlush();
  }
  ReactReconciler.unmountComponent(
    instance,
    false /* safely */,
    false /* skipLifecycle */
  );
  if (__DEV__) {
    ReactInstrumentation.debugTool.onEndFlush();
  }

  if (container.nodeType === DOC_NODE_TYPE) {
    container = container.documentElement;
  }

  // http://jsperf.com/emptying-a-node
  while (container.lastChild) {
    container.removeChild(container.lastChild);
  }
}

/**
 * True if the supplied DOM node has a direct React-rendered child that is
 * not a React root element. Useful for warning in `render`,
 * `unmountComponentAtNode`, etc.
 *
 * @param {?DOMElement} node The candidate DOM node.
 * @return {boolean} True if the DOM element contains a direct child that was
 * rendered by React but is not a root element.
 * @internal
 */
function hasNonRootReactChild(container) {
  var rootEl = getReactRootElementInContainer(container);
  if (rootEl) {
    var inst = ReactDOMComponentTree.getInstanceFromNode(rootEl);
    return !!(inst && inst._hostParent);
  }
}

/**
 * True if the supplied DOM node is a React DOM element and
 * it has been rendered by another copy of React.
 *
 * @param {?DOMElement} node The candidate DOM node.
 * @return {boolean} True if the DOM has been rendered by another copy of React
 * @internal
 */
function nodeIsRenderedByOtherInstance(container) {
  var rootEl = getReactRootElementInContainer(container);
  return !!(rootEl && isReactNode(rootEl) && !ReactDOMComponentTree.getInstanceFromNode(rootEl));
}

/**
 * True if the supplied DOM node is a valid node element.
 *
 * @param {?DOMElement} node The candidate DOM node.
 * @return {boolean} True if the DOM is a valid DOM node.
 * @internal
 */
function isValidContainer(node) {
  return !!(node && (
    node.nodeType === ELEMENT_NODE_TYPE ||
    node.nodeType === DOC_NODE_TYPE ||
    node.nodeType === DOCUMENT_FRAGMENT_NODE_TYPE
  ));
}

/**
 * True if the supplied DOM node is a valid React node element.
 *
 * @param {?DOMElement} node The candidate DOM node.
 * @return {boolean} True if the DOM is a valid React DOM node.
 * @internal
 */
function isReactNode(node) {
  return isValidContainer(node) && (node.hasAttribute(ROOT_ATTR_NAME) || node.hasAttribute(ATTR_NAME));
}

function getHostRootInstanceInContainer(container) {
  var rootEl = getReactRootElementInContainer(container);
  var prevHostInstance =
    rootEl && ReactDOMComponentTree.getInstanceFromNode(rootEl);
  return (
    prevHostInstance && !prevHostInstance._hostParent ?
    prevHostInstance : null
  );
}

function getTopLevelWrapperInContainer(container) {
  var root = getHostRootInstanceInContainer(container);
  return root ? root._hostContainerInfo._topLevelWrapper : null;
}

/**
 * Temporary (?) hack so that we can store all top-level pending updates on
 * composites instead of having to worry about different types of components
 * here.
 */
var topLevelRootCounter = 1;
var TopLevelWrapper = function() {
  this.rootID = topLevelRootCounter++;
};
TopLevelWrapper.prototype.isReactComponent = {};
if (__DEV__) {
  TopLevelWrapper.displayName = 'TopLevelWrapper';
}
TopLevelWrapper.prototype.render = function() {
  return this.props.child;
};
TopLevelWrapper.isReactTopLevelWrapper = true;

/**
 * Mounting is the process of initializing a React component by creating its
 * representative DOM elements and inserting them into a supplied `container`.
 * Any prior content inside `container` is destroyed in the process.
 *
 *   ReactMount.render(
 *     component,
 *     document.getElementById('container')
 *   );
 *
 *   <div id="container">                   <-- Supplied `container`.
 *     <div data-reactid=".3">              <-- Rendered reactRoot of React
 *       // ...                                 component.
 *     </div>
 *   </div>
 *
 * Inside of `container`, the first element rendered is the "reactRoot".
 */
var ReactMount = {

  TopLevelWrapper: TopLevelWrapper,

  /**
   * Used by devtools. The keys are not important.
   */
  _instancesByReactRootID: instancesByReactRootID,

  /**
   * This is a hook provided to support rendering React components while
   * ensuring that the apparent scroll position of its `container` does not
   * change.
   *
   * @param {DOMElement} container The `container` being rendered into.
   * @param {function} renderCallback This must be called once to do the render.
   */
  scrollMonitor: function(container, renderCallback) {
    renderCallback();
  },

  /**
   * Take a component that's already mounted into the DOM and replace its props
   * @param {ReactComponent} prevComponent component instance already in the DOM
   * @param {ReactElement} nextElement component instance to render
   * @param {DOMElement} container container to render into
   * @param {?function} callback function triggered on completion
   */
  _updateRootComponent: function(
      prevComponent,
      nextElement,
      nextContext,
      container,
      callback) {
    ReactMount.scrollMonitor(container, function() {
      ReactUpdateQueue.enqueueElementInternal(prevComponent, nextElement, nextContext);
      if (callback) {
        ReactUpdateQueue.enqueueCallbackInternal(prevComponent, callback);
      }
    });

    return prevComponent;
  },

  /**
   * Render a new component into the DOM. Hooked by hooks!
   * 渲染一个新的组件到container中，并返回内部组件实例
   * @param {ReactElement} nextElement element to render
   * @param {DOMElement} container container to render into
   * @param {boolean} shouldReuseMarkup if we should skip the markup insertion
   * @return {ReactComponent} nextComponent
   */
  _renderNewRootComponent: function(
    nextElement,
    container,
    shouldReuseMarkup,
    context,
    callback
  ) {
    // Various parts of our code (such as ReactCompositeComponent's
    // _renderValidatedComponent) assume that calls to render aren't nested;
    // verify that that's the case.
    warning(
      ReactCurrentOwner.current == null,
      '_renderNewRootComponent(): Render methods should be a pure function ' +
      'of props and state; triggering nested component updates from ' +
      'render is not allowed. If necessary, trigger nested updates in ' +
      'componentDidUpdate.\n\nCheck the render method of %s.',
      ReactCurrentOwner.current && ReactCurrentOwner.current.getName() ||
        'ReactCompositeComponent'
    );

    invariant(
      isValidContainer(container),
      '_registerComponent(...): Target container is not a DOM element.'
    );

    ReactBrowserEventEmitter.ensureScrollValueMonitoring();
    //初始化ReactComponent，根据ReactElement中不同的type字段，创建不同类型的组件对象。用于管理ReactComponent实例的生命周期。
    var componentInstance = instantiateReactComponent(nextElement, false);

    if (callback) {
      //加入回调对列
      componentInstance._pendingCallbacks = [function() {
        validateCallback(callback);
        callback.call(componentInstance._renderedComponent.getPublicInstance());
      }];
    }

    // The initial render is synchronous but any updates that happen during
    // rendering, in componentWillMount or componentDidMount, will be batched
    // according to the current batching strategy.
  // 处理batchedMountComponentIntoNode方法调用，将ReactComponent插入DOM中，后面详细分析
    ReactUpdates.batchedUpdates( //这里也是以事务形式执行函数batchedMountComponentIntoNode，执行后还会冲洗脏组件（即，调用setState的组件）。
      batchedMountComponentIntoNode,//callback
      componentInstance,    //a
      container,            //b
      shouldReuseMarkup,    //c
      context               //d
    );

    var wrapperID = componentInstance._instance.rootID;//一般值为1.如果在index.html,有多个container挂载reactElement的话，则该值递增。
    instancesByReactRootID[wrapperID] = componentInstance;

    return componentInstance;
  },

  /**
   * Renders a React component into the DOM in the supplied `container`.
   *
   * If the React component was previously rendered into `container`, this will
   * perform an update on it and only mutate the DOM as necessary to reflect the
   * latest React component.
   * 将ReactElement插入DOM中，并返回ReactElement对应的ReactComponent。
   * ReactElement是React元素在内存中的表示形式，可以理解为一个数据类，包含type，key，refs，props等成员变量
   * ReactComponent是React元素的操作类，包含mountComponent(), updateComponent()等很多操作组件的方法
   * @param {ReactComponent} parentComponent The conceptual概念上的 parent of this render tree.
   * @param {ReactElement} nextElement Component element to render.
   * @param {DOMElement} container DOM element to render into.
   * @param {?function} callback function triggered on completion
   * @return {ReactComponent} Component instance rendered in `container`.
   */
  renderSubtreeIntoContainer: function(parentComponent, nextElement, container, callback) {
    invariant(
      parentComponent != null && ReactInstanceMap.has(parentComponent),
      'parentComponent must be a valid React Component'
    );
    return ReactMount._renderSubtreeIntoContainer(
      parentComponent,
      nextElement,
      container,
      callback
    );
  },
  /**
   * 作用是：先对container内容进行分析，然后分情况渲染组件树到container中
   * 1.已经执行过ReactDOM.render(),进行更新操作或先卸载再继续执行挂载
   * 2.判断是否是服务器端渲染。
   * @param parentComponent
   * @param nextElement
   * @param container
   * @param callback
   * @private
   */
  _renderSubtreeIntoContainer: function(parentComponent, nextElement, container, callback) {
    callback = callback === undefined ? null : callback;
    if (__DEV__) {
      warning(
        callback === null || typeof callback === 'function',
        'render(...): Expected the last optional `callback` argument to be a ' +
        'function. Instead received: %s.',
        String(callback)
      );
    }
    if (!React.isValidElement(nextElement)) {
      if (typeof nextElement === 'string') {
        invariant(
          false,
          'ReactDOM.render(): Invalid component element. Instead of ' +
          'passing a string like \'div\', pass ' +
          'React.createElement(\'div\') or <div />.'
        );
      } else if (typeof nextElement === 'function') {
        invariant(
          false,
          'ReactDOM.render(): Invalid component element. Instead of ' +
          'passing a class like Foo, pass React.createElement(Foo) ' +
          'or <Foo />.'
        );
      } else if (nextElement != null && typeof nextElement.props !== 'undefined') {
        // Check if it quacks like an element
        invariant(
          false,
          'ReactDOM.render(): Invalid component element. This may be ' +
          'caused by unintentionally loading two independent copies ' +
          'of React.'
        );
      } else {
        invariant(
          false,
          'ReactDOM.render(): Invalid component element.'
        );
      }
    }

    warning(
      !container || !container.tagName ||
      container.tagName.toUpperCase() !== 'BODY',
      'render(): Rendering components directly into document.body is ' +
      'discouraged, since its children are often manipulated by third-party ' +
      'scripts and browser extensions. This may lead to subtle ' +
      'reconciliation issues. Try rendering into a container element created ' +
      'for your app.'
    );
    //包装ReactElement，将nextElement挂载到wrapper的props属性下.
    // 这里为了操作的统一。因为在做dom diff 的时候，ReactElement的比较始终是在父Component这个容器的控制下进行。
    var nextWrappedElement = React.createElement(
      TopLevelWrapper,
      { child: nextElement }
    );
    /*
    {
      type:TopLevelWrapper,
      props:{
        child:nextElement
      }
    }
    */
    var nextContext = getContextForSubtree(parentComponent);
    //获取要插入到的容器的前一次的ReactComponent，这是为了做DOMdiff
    //对于ReactDOM.render()调用，preComponent为null
    var prevComponent = getTopLevelWrapperInContainer(container);
    //如果多次执行ReactDOM.render()，则prevComponent不为null
    if (prevComponent) {
      //从prevComponent中获取到prevElement这个数据对象，这里的prevWrappedElement的type为TopLevelWrapper。
      var prevWrappedElement = prevComponent._currentElement;
      var prevElement = prevWrappedElement.props.child; //这里的prevElement是真正的，用户ReactDOM.render(element,containner)的ReactElement。
      //DOM diff 精髓，同一层级内，type和key不变时，只用update就行，否则先UNmount再mount组件
      //这是React为了避免递归太深，而做的DOMdiff前提假设。它只对同一DOM层，type相同，key（如果有）相同的组件做DOM diff
      //否则不用比较，直接先unmount再mount。这个假设使得diff算法复杂度从O(n^3)降低为O(n).
      if (shouldUpdateReactComponent(prevElement, nextElement)) {
        var publicInst = prevComponent._renderedComponent.getPublicInstance();//publicInst对应用户自定义组件如<App/>的实例
        var updatedCallback = callback && function() {
          validateCallback(callback);
          callback.call(publicInst);
        };
        //只需要update，调用_updateRootComponent,然后return了
        ReactMount._updateRootComponent(
          prevComponent,
          nextWrappedElement,
          nextContext,
          container,
          updatedCallback
        );
        return publicInst;
      } else {
        //不做update，直接先卸载再挂载，即unMountComponent，再mountComponent。
        ReactMount.unmountComponentAtNode(container);
      }
    }

    var reactRootElement = getReactRootElementInContainer(container);
    //检测container是否已经含有ReactMarkup。是通过检测元素是否含有data-reactid属性。为了服务端渲染检测。
    var containerHasReactMarkup =
      reactRootElement && !!internalGetID(reactRootElement);
    var containerHasNonRootReactChild = hasNonRootReactChild(container);

    if (__DEV__) {
      warning(
        !containerHasNonRootReactChild,
        'render(...): Replacing React-rendered children with a new root ' +
        'component. If you intended to update the children of this node, ' +
        'you should instead have the existing children update their state ' +
        'and render the new components instead of calling ReactDOM.render.'
      );

      if (!containerHasReactMarkup || reactRootElement.nextSibling) {
        var rootElementSibling = reactRootElement;
        while (rootElementSibling) {
          if (internalGetID(rootElementSibling)) {
            warning(
              false,
              'render(): Target node has markup rendered by React, but there ' +
              'are unrelated nodes as well. This is most commonly caused by ' +
              'white-space inserted around server-rendered markup.'
            );
            break;
          }
          rootElementSibling = rootElementSibling.nextSibling;
        }
      }
    }
    //标记是否利用原有的元素。
    var shouldReuseMarkup =
      containerHasReactMarkup &&
      !prevComponent &&
      !containerHasNonRootReactChild;
    //初始化，渲染组件，然后插入DOM中，_renderNewRootComponent很关键
    var component = ReactMount._renderNewRootComponent(
      nextWrappedElement,
      container,
      shouldReuseMarkup,
      nextContext,
      callback
    )._renderedComponent.getPublicInstance();

    return component;
  },


  /**
   * Renders a React component into the DOM in the supplied `container`.
   * See https://facebook.github.io/react/docs/react-dom.html#render
   *
   * If the React component was previously rendered into `container`, this will
   * perform an update on it and only mutate the DOM as necessary to reflect the
   * latest React component.
   *
   * @param {ReactElement} nextElement Component element to render.
   * @param {DOMElement} container DOM element to render into.
   * @param {?function} callback function triggered on completion
   * @return {ReactComponent} Component instance rendered in `container`.
   */
  render: function(nextElement, container, callback) {
    return ReactMount._renderSubtreeIntoContainer(null, nextElement, container, callback);
  },

  /**
   * Unmounts and destroys the React component rendered in the `container`.
   * See https://facebook.github.io/react/docs/react-dom.html#unmountcomponentatnode
   *
   * @param {DOMElement} container DOM element containing a React component.
   * @return {boolean} True if a component was found in and unmounted from
   *                   `container`
   */
  unmountComponentAtNode: function(container) {
    // Various parts of our code (such as ReactCompositeComponent's
    // _renderValidatedComponent) assume that calls to render aren't nested;
    // verify that that's the case. (Strictly speaking, unmounting won't cause a
    // render but we still don't expect to be in a render call here.)
    warning(
      ReactCurrentOwner.current == null,
      'unmountComponentAtNode(): Render methods should be a pure function ' +
      'of props and state; triggering nested component updates from render ' +
      'is not allowed. If necessary, trigger nested updates in ' +
      'componentDidUpdate.\n\nCheck the render method of %s.',
      ReactCurrentOwner.current && ReactCurrentOwner.current.getName() ||
        'ReactCompositeComponent'
    );

    invariant(
      isValidContainer(container),
      'unmountComponentAtNode(...): Target container is not a DOM element.'
    );

    if (__DEV__) {
      warning(
        !nodeIsRenderedByOtherInstance(container),
        'unmountComponentAtNode(): The node you\'re attempting to unmount ' +
        'was rendered by another copy of React.'
      );
    }

    var prevComponent = getTopLevelWrapperInContainer(container);
    if (!prevComponent) {
      // Check if the node being unmounted was rendered by React, but isn't a
      // root node.
      var containerHasNonRootReactChild = hasNonRootReactChild(container);

      // Check if the container itself is a React root node.
      var isContainerReactRoot =
        container.nodeType === 1 && container.hasAttribute(ROOT_ATTR_NAME);

      if (__DEV__) {
        warning(
          !containerHasNonRootReactChild,
          'unmountComponentAtNode(): The node you\'re attempting to unmount ' +
          'was rendered by React and is not a top-level container. %s',
          (
            isContainerReactRoot ?
              'You may have accidentally passed in a React root node instead ' +
              'of its container.' :
              'Instead, have the parent component update its state and ' +
              'rerender in order to remove this component.'
          )
        );
      }

      return false;
    }
    delete instancesByReactRootID[prevComponent._instance.rootID];
    ReactUpdates.batchedUpdates(
      unmountComponentFromNode,
      prevComponent,
      container
    );
    return true;
  },
  /**
   * 将html插入container。
   * 1.如果是服务器端渲染，则进行校验和比较
   * 2.将html插入container，并将内部组件hostComponent实例保存到html的__reactInternalInstance$...属性中。
   *
   * @param markup
   * @param container
   * @param instance <ReactCompositeComponentWrapper> _topLevelWrapper
   * @param shouldReuseMarkup
   * @param transaction
   * @private
   */
  _mountImageIntoNode: function(
    markup,
    container,
    instance,//<ReactCompositeComponentWrapper>
    shouldReuseMarkup,
    transaction
  ) {
    invariant(
      isValidContainer(container),
      'mountComponentIntoNode(...): Target container is not valid.'
    );
// 对于ReactDOM.render()调用，shouldReuseMarkup为false
    //对于，服务器端渲染ReactDOMServer.renderToString()调用后，shouldReuseMarkup为true
    //checkSum通过adler32算法计算
    if (shouldReuseMarkup) {
      var rootElement = getReactRootElementInContainer(container);
      if (ReactMarkupChecksum.canReuseMarkup(markup, rootElement)) {
        ReactDOMComponentTree.precacheNode(instance, rootElement);
        return;
      } else {
        var checksum = rootElement.getAttribute(
          ReactMarkupChecksum.CHECKSUM_ATTR_NAME
        );
        rootElement.removeAttribute(ReactMarkupChecksum.CHECKSUM_ATTR_NAME);

        var rootMarkup = rootElement.outerHTML;
        rootElement.setAttribute(
          ReactMarkupChecksum.CHECKSUM_ATTR_NAME,
          checksum
        );

        var normalizedMarkup = markup;
        if (__DEV__) {
          // because rootMarkup is retrieved from the DOM, various normalizations
          // will have occurred which will not be present in `markup`. Here,
          // insert markup into a <div> or <iframe> depending on the container
          // type to perform the same normalizations before comparing.
          var normalizer;
          if (container.nodeType === ELEMENT_NODE_TYPE) {
            normalizer = document.createElement('div');
            normalizer.innerHTML = markup;
            normalizedMarkup = normalizer.innerHTML;
          } else {
            normalizer = document.createElement('iframe');
            document.body.appendChild(normalizer);
            normalizer.contentDocument.write(markup);
            normalizedMarkup = normalizer.contentDocument.documentElement.outerHTML;
            document.body.removeChild(normalizer);
          }
        }

        var diffIndex = firstDifferenceIndex(normalizedMarkup, rootMarkup);
        var difference = ' (client) ' +
          normalizedMarkup.substring(diffIndex - 20, diffIndex + 20) +
          '\n (server) ' + rootMarkup.substring(diffIndex - 20, diffIndex + 20);

        invariant(
          container.nodeType !== DOC_NODE_TYPE,
          'You\'re trying to render a component to the document using ' +
          'server rendering but the checksum was invalid. This usually ' +
          'means you rendered a different component type or props on ' +
          'the client from the one on the server, or your render() ' +
          'methods are impure. React cannot handle this case due to ' +
          'cross-browser quirks by rendering at the document root. You ' +
          'should look for environment dependent code in your components ' +
          'and ensure the props are the same client and server side:\n%s',
          difference
        );

        if (__DEV__) {
          warning(
            false,
            'React attempted to reuse markup in a container but the ' +
            'checksum was invalid. This generally means that you are ' +
            'using server rendering and the markup generated on the ' +
            'server was not what the client was expecting. React injected ' +
            'new markup to compensate which works but you have lost many ' +
            'of the benefits of server rendering. Instead, figure out ' +
            'why the markup being generated is different on the client ' +
            'or server:\n%s',
            difference
          );
        }
      }
    }

    invariant(
      container.nodeType !== DOC_NODE_TYPE,
      'You\'re trying to render a component to the document but ' +
        'you didn\'t use server rendering. We can\'t do this ' +
        'without using server rendering due to cross-browser quirks. ' +
        'See ReactDOMServer.renderToString() for server rendering.'
    );

    if (transaction.useCreateElement) {
        // 清空container的子节点，这个地方不明白为什么这么做
      while (container.lastChild) {
        container.removeChild(container.lastChild);
      }
      DOMLazyTree.insertTreeBefore(container, markup, null);
    } else {
      //将markup这个html设置到container这个dom元素的innerHTML属性上，这样就插入到了DOM中了
      setInnerHTML(container, markup);
     //instance是ReactCompositeComponent的实例，用于操作自定义组件
     // ReactDOMComponentTree.precacheNode处理后，是将整个ReactElement嵌套对象（Virtual DOM）保存到container这个DOM元素的firstChild这个原生节点上。
     // 简单理解就是将Virtual DOM保存到内存中，这样可以大大提高交互效率
      ReactDOMComponentTree.precacheNode(instance, container.firstChild);
    }

    if (__DEV__) {
      var hostNode = ReactDOMComponentTree.getInstanceFromNode(container.firstChild);
      if (hostNode._debugID !== 0) {
        ReactInstrumentation.debugTool.onHostOperation({
          instanceID: hostNode._debugID,
          type: 'mount',
          payload: markup.toString(),
        });
      }
    }
  },
};

module.exports = ReactMount;
