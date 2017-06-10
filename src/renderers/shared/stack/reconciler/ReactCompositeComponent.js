/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactCompositeComponent
 */

'use strict';

var React = require('React');
var ReactComponentEnvironment = require('ReactComponentEnvironment');
var ReactCompositeComponentTypes = require('ReactCompositeComponentTypes');
var ReactCurrentOwner = require('ReactCurrentOwner');
var ReactErrorUtils = require('ReactErrorUtils');
var ReactFeatureFlags = require('ReactFeatureFlags');
var ReactInstanceMap = require('ReactInstanceMap');
var ReactInstrumentation = require('ReactInstrumentation');
var ReactNodeTypes = require('ReactNodeTypes');
var ReactReconciler = require('ReactReconciler');

if (__DEV__) {
  var checkReactTypeSpec = require('checkReactTypeSpec');
  var ReactDebugCurrentFrame = require('ReactDebugCurrentFrame');
  var warningAboutMissingGetChildContext = {};
}

var emptyObject = require('emptyObject');
var invariant = require('invariant');
var shallowEqual = require('shallowEqual');
var shouldUpdateReactComponent = require('shouldUpdateReactComponent');
var warning = require('warning');

function StatelessComponent(Component) {
}
StatelessComponent.prototype.render = function() {
  var Component = ReactInstanceMap.get(this)._currentElement.type;
  var element = Component(this.props, this.context, this.updater);
  return element;
};

function shouldConstruct(Component) {
  return !!(Component.prototype && Component.prototype.isReactComponent);
}

function isPureComponent(Component) {
  return !!(Component.prototype && Component.prototype.isPureReactComponent);
}

// Separated into a function to contain deoptimizations caused by try/finally.
function measureLifeCyclePerf(fn, debugID, timerType) {
  if (debugID === 0) {
    // Top-level wrappers (see ReactMount) and empty components (see
    // ReactDOMEmptyComponent) are invisible to hooks and devtools.
    // Both are implementation details that should go away in the future.
    return fn();
  }

  ReactInstrumentation.debugTool.onBeginLifeCycleTimer(debugID, timerType);
  try {
    return fn();
  } finally {
    ReactInstrumentation.debugTool.onEndLifeCycleTimer(debugID, timerType);
  }
}

/**
 * ------------------ The Life-Cycle of a Composite Component ------------------
 *
 * - constructor: Initialization of state. The instance is now retained.
 *   - componentWillMount
 *   - render
 *   - [children's constructors]
 *     - [children's componentWillMount and render]
 *     - [children's componentDidMount]
 *     - componentDidMount
 *
 *       Update Phases:
 *       - componentWillReceiveProps (only called if parent updated)
 *       - shouldComponentUpdate
 *         - componentWillUpdate
 *           - render
 *           - [children's constructors or receive props phases]
 *         - componentDidUpdate
 *
 *     - componentWillUnmount
 *     - [children's componentWillUnmount]
 *   - [children destroyed]
 * - (destroyed): The instance is now blank, released by React and ready for GC.
 *
 * -----------------------------------------------------------------------------
 */

/**
 * An incrementing ID assigned to each component when it is mounted. This is
 * used to enforce the order in which `ReactUpdates` updates dirty components.
 *
 * @private
 */
var nextMountID = 1;

/**
 * @lends {ReactCompositeComponent.prototype}
 */
var ReactCompositeComponent = {

  /**
   * Base constructor for all composite component.
   *
   * @param {ReactElement} element
   * @final
   * @internal
   */
  construct: function(element) {
    this._currentElement = element;//该组件对应的ReactElement
    this._rootNodeID = 0;
    this._compositeType = null;
    this._instance = null; //自定义组件实例化对象，element.type实例化
    this._hostParent = null; //表示父组件为host类型的内部实例对象
    this._hostContainerInfo = null;

    // See ReactUpdateQueue
    this._updateBatchNumber = null;
    this._pendingElement = null;
    this._pendingStateQueue = null;
    this._pendingReplaceState = false;
    this._pendingForceUpdate = false;

    this._renderedNodeType = null; //自定义组件实例执行render后，返回的renderedElement的数据类型。
    this._renderedComponent = null;//是该组件render后的renderedElement,renderedElement再实例化后的到组件_renderedComponent
    this._context = null;
    this._mountOrder = 0; //表示挂载的顺序
    this._topLevelWrapper = null;

    // See ReactUpdates and ReactUpdateQueue.
    this._pendingCallbacks = null;

    // ComponentWillUnmount shall only be called once
    this._calledComponentWillUnmount = false;

    if (__DEV__) {
      this._warnedAboutRefsInRender = false;
    }
  },

  /**
   * Initializes the component, renders markup, and registers event listeners.
   *
   * @param {ReactReconcileTransaction|ReactServerRenderingTransaction} transaction
   * @param {?object} hostParent 宿主节点
   * @param {?object} hostContainerInfo 宿主信息
   * @param {?object} context
   * @return {?string} Rendered markup to be inserted into the DOM.
   * @final
   * @internal
   */
  mountComponent: function(
    transaction,
    hostParent, //如果是在ReactCompisiteComponent中调用的ReactReconciler.mountComponent,hostParent为null，在ReactDOMComponent中调用的，hostParent为对应的实例。
    hostContainerInfo,
    context
  ) {
    this._context = context;
    this._mountOrder = nextMountID++;
    this._hostParent = hostParent;
    this._hostContainerInfo = hostContainerInfo;
    //做propTypes是否合法判断，这个只在开发阶段有用
    var publicProps = this._currentElement.props;
    var publicContext = this._processContext(context);

    var Component = this._currentElement.type;//初始挂载的时候，type为TopLevelWrapper
    //得到ReactUpdateQueue实例
    var updateQueue = transaction.getUpdateQueue();

    // Initialize the public class
    var doConstruct = shouldConstruct(Component);//初始挂载值为true
    var inst = this._constructComponent(
      doConstruct,
      publicProps,
      publicContext,
      updateQueue
    );
    var renderedElement;

    // Support functional components
    //inst或者inst.render为空对应的是stateless组件，也就是无状态组件
    //无状态组件没有实例对象，它本质上只是一个返回jsx的函数而已。是一种轻量级的React组件
    if (!doConstruct && (inst == null || inst.render == null)) {
      renderedElement = inst;
      if (__DEV__) {
        warning(
          !Component.childContextTypes,
          '%s(...): childContextTypes cannot be defined on a functional component.',
          Component.displayName || Component.name || 'Component'
        );
      }
      invariant(
        inst === null ||
        inst === false ||
        React.isValidElement(inst),
        '%s(...): A valid React element (or null) must be returned. You may have ' +
        'returned undefined, an array or some other invalid object.',
        Component.displayName || Component.name || 'Component'
      );
      inst = new StatelessComponent(Component);
      this._compositeType = ReactCompositeComponentTypes.StatelessFunctional;
    } else {
      if (isPureComponent(Component)) {
        this._compositeType = ReactCompositeComponentTypes.PureClass;
      } else {
        this._compositeType = ReactCompositeComponentTypes.ImpureClass;
      }
    }

    if (__DEV__) {
      // This will throw later in _renderValidatedComponent, but add an early
      // warning now to help debugging
      if (inst.render == null) {
        warning(
          false,
          '%s(...): No `render` method found on the returned component ' +
          'instance: you may have forgotten to define `render`.',
          Component.displayName || Component.name || 'Component'
        );
      }

      var propsMutated = inst.props !== publicProps;
      var componentName =
        Component.displayName || Component.name || 'Component';

      warning(
        inst.props === undefined || !propsMutated,
        '%s(...): When calling super() in `%s`, make sure to pass ' +
        'up the same props that your component\'s constructor was passed.',
        componentName, componentName
      );
    }

    // These should be set up in the constructor, but as a convenience for
    // simpler class abstractions, we set them up after the fact.
    //设置变量
    inst.props = publicProps;
    inst.context = publicContext;
    inst.refs = emptyObject;
    inst.updater = updateQueue;

    this._instance = inst;

    // Store a reference from the instance back to the internal representation
    //存储实例对象的引用到map中，方便以后查找
    ReactInstanceMap.set(inst, this);//用户自定义组件实例 存储对应的ReactCompositeComponent实例

    if (__DEV__) {
      // Since plain JS classes are defined without any special initialization
      // logic, we can not catch common errors early. Therefore, we have to
      // catch them here, at initialization time, instead.
      warning(
        !inst.getInitialState ||
        inst.getInitialState.isReactClassApproved ||
        inst.state,
        'getInitialState was defined on %s, a plain JavaScript class. ' +
        'This is only supported for classes created using React.createClass. ' +
        'Did you mean to define a state property instead?',
        this.getName() || 'a component'
      );
      warning(
        !inst.getDefaultProps ||
        inst.getDefaultProps.isReactClassApproved,
        'getDefaultProps was defined on %s, a plain JavaScript class. ' +
        'This is only supported for classes created using React.createClass. ' +
        'Use a static property to define defaultProps instead.',
        this.getName() || 'a component'
      );
      warning(
        !inst.propTypes,
        'propTypes was defined as an instance property on %s. Use a static ' +
        'property to define propTypes instead.',
        this.getName() || 'a component'
      );
      warning(
        !inst.contextTypes,
        'contextTypes was defined as an instance property on %s. Use a ' +
        'static property to define contextTypes instead.',
        this.getName() || 'a component'
      );
      warning(
        typeof inst.componentShouldUpdate !== 'function',
        '%s has a method called ' +
        'componentShouldUpdate(). Did you mean shouldComponentUpdate()? ' +
        'The name is phrased as a question because the function is ' +
        'expected to return a value.',
        (this.getName() || 'A component')
      );
      warning(
        typeof inst.componentDidUnmount !== 'function',
        '%s has a method called ' +
        'componentDidUnmount(). But there is no such lifecycle method. ' +
        'Did you mean componentWillUnmount()?',
        this.getName() || 'A component'
      );
      warning(
        typeof inst.componentWillRecieveProps !== 'function',
        '%s has a method called ' +
        'componentWillRecieveProps(). Did you mean componentWillReceiveProps()?',
        (this.getName() || 'A component')
      );
    }
    //初始化state，队列等
    var initialState = inst.state;
    if (initialState === undefined) {
      inst.state = initialState = null;
    }
    invariant(
      typeof initialState === 'object' && !Array.isArray(initialState),
      '%s.state: must be set to an object or null',
      this.getName() || 'ReactCompositeComponent'
    );

    this._pendingStateQueue = null;
    this._pendingReplaceState = false;
    this._pendingForceUpdate = false;

    if (inst.componentWillMount) {
      if (__DEV__) {
        measureLifeCyclePerf(
          () => inst.componentWillMount(),
          this._debugID,
          'componentWillMount'
        );
      } else {
        inst.componentWillMount();
      }
      // When mounting, calls to `setState` by `componentWillMount` will set
      // `this._pendingStateQueue` without triggering a re-render.
      if (this._pendingStateQueue) {
        inst.state = this._processPendingState(inst.props, inst.context);
      }
    }

    var markup;
    if (inst.unstable_handleError) {
      //挂载出错时，进行一些错误处理，然后performInitialMount，初始化挂载
      markup = this.performInitialMountWithErrorHandling(
        renderedElement,
        hostParent,
        hostContainerInfo,
        transaction,
        context
      );
    } else {
      //初始化挂载
      markup = this.performInitialMount(
        renderedElement,
        hostParent,
        hostContainerInfo,
        transaction,
        context
      );
    }

    if (inst.componentDidMount) {
      if (__DEV__) {
        transaction.getReactMountReady().enqueue(() => {
          measureLifeCyclePerf(
            () => inst.componentDidMount(),
            this._debugID,
            'componentDidMount'
          );
        });
      } else {
        //调用componentDidMount，以事务的形式
        transaction.getReactMountReady().enqueue(inst.componentDidMount, inst);
      }
    }

    // setState callbacks during willMount should end up here
    const callbacks = this._pendingCallbacks;
    if (callbacks) {
      this._pendingCallbacks = null;
      for (let i = 0; i < callbacks.length; i++) {
        transaction.getReactMountReady().enqueue(
          callbacks[i],
          inst
        );
      }
    }

    return markup;
  },

  _constructComponent: function(
    doConstruct,
    publicProps,
    publicContext,
    updateQueue
  ) {
    if (__DEV__) {
      ReactCurrentOwner.current = this;
      try {
        return this._constructComponentWithoutOwner(
          doConstruct,
          publicProps,
          publicContext,
          updateQueue
        );
      } finally {
        ReactCurrentOwner.current = null;
      }
    } else {
      return this._constructComponentWithoutOwner(
        doConstruct,
        publicProps,
        publicContext,
        updateQueue
      );
    }
  },

  _constructComponentWithoutOwner: function(
    doConstruct,
    publicProps,
    publicContext,
    updateQueue
  ) {
    var Component = this._currentElement.type;

    if (doConstruct) {
      if (__DEV__) {
        return measureLifeCyclePerf(
          () => new Component(publicProps, publicContext, updateQueue),
          this._debugID,
          'ctor'
        );
      } else {
        return new Component(publicProps, publicContext, updateQueue);
      }
    }

    // This can still be an instance in case of factory components
    // but we'll count this as time spent rendering as the more common case.
    if (__DEV__) {
      return measureLifeCyclePerf(
        () => Component(publicProps, publicContext, updateQueue),
        this._debugID,
        'render'
      );
    } else {
      return Component(publicProps, publicContext, updateQueue);
    }
  },

  performInitialMountWithErrorHandling: function(
    renderedElement,
    hostParent,
    hostContainerInfo,
    transaction,
    context
  ) {
    var markup;
    var checkpoint = transaction.checkpoint();
    try {
      //放到try-catch中，如果没有出错则调用performInitialMount初始化挂载。这里没有特别的操作，也就是一些错误处理而已。
      markup = this.performInitialMount(
        renderedElement,
        hostParent,
        hostContainerInfo,
        transaction,
        context
      );
    } catch (e) {
      //handlerError，卸载组件，然后重新performInitialMount初始化挂载
      // Roll back to checkpoint, handle error (which may add items to the transaction), and take a new checkpoint
      transaction.rollback(checkpoint);
      this._instance.unstable_handleError(e);
      if (this._pendingStateQueue) {
        this._instance.state = this._processPendingState(this._instance.props, this._instance.context);
      }
      checkpoint = transaction.checkpoint();
      this._renderedComponent.unmountComponent(
        true, /* safely */
        // Don't call componentWillUnmount() because they never fully mounted:
        true /* skipLifecyle */
      );
      transaction.rollback(checkpoint);

      // Try again - we've informed the component about the error, so they can render an error message this time.
      // If this throws again, the error will bubble up (and can be caught by a higher error boundary).
      markup = this.performInitialMount(
        renderedElement,
        hostParent,
        hostContainerInfo,
        transaction,
        context
      );
    }
    return markup;
  },

  performInitialMount: function(
    renderedElement,
    hostParent,
    hostContainerInfo,
    transaction,
    context
  ) {
    // If not a stateless component, we now render
    //如果不是无状态组件，执行render，返回ReactElement
    if (renderedElement === undefined) {
      renderedElement = this._renderValidatedComponent();
    }
    //得到组件类型，如空组件ReactNodeTypes.EMPTY，自定义React组件ReactNodeTypes.COMPOSITE，
    //DOM原生组件ReactNodeTypes.NATIVE，自定义组件本质上是一个函数（构造函数）
    var nodeType = ReactNodeTypes.getType(renderedElement);
    this._renderedNodeType = nodeType;//如果是自定义组件，自定义组件实例render返回的renderedElement的类型。
    //由ReactElement生成ReactComponent(component element,dom element),根据不同type创建不同Component
    var child = this._instantiateReactComponent(
      renderedElement,
      nodeType !== ReactNodeTypes.EMPTY /* shouldHaveDebugID */
    );
    this._renderedComponent = child; //初始化加载时，这里的child是真正的用户自定义组件的操作对象。

    var debugID = 0;
    if (__DEV__) {
      debugID = this._debugID;
    }
    //递归渲染，渲染子组件
    var markup = ReactReconciler.mountComponent(
      child,
      transaction,
      hostParent,
      hostContainerInfo,
      this._processChildContext(context),
      debugID
    );

    if (__DEV__) {
      if (debugID !== 0) {
        var childDebugIDs = child._debugID !== 0 ? [child._debugID] : [];
        ReactInstrumentation.debugTool.onSetChildren(debugID, childDebugIDs);
      }
    }

    return markup;
  },

  getHostNode: function() {
    return ReactReconciler.getHostNode(this._renderedComponent);
  },

  /**
   * Releases any resources allocated by `mountComponent`.
   *
   * @final
   * @internal
   */
  unmountComponent: function(safely, skipLifecycle) {
    if (!this._renderedComponent) {
      return;
    }

    var inst = this._instance;
    //调用componentWillUnmount
    if (inst.componentWillUnmount && !inst._calledComponentWillUnmount) {
      inst._calledComponentWillUnmount = true;
      //安全模式下，将componentWillUnmount包在try-catch中。否则直接componentWillUnmount
      if (safely) {
        if (!skipLifecycle) {
          var name = this.getName() + '.componentWillUnmount()';
          ReactErrorUtils.invokeGuardedCallback(name, inst.componentWillUnmount.bind(inst));
        }
      } else {
        if (__DEV__) {
          measureLifeCyclePerf(
            () => inst.componentWillUnmount(),
            this._debugID,
            'componentWillUnmount'
          );
        } else {
          inst.componentWillUnmount();
        }
      }
    }
    //递归调用UNMountComponent来销毁子组件
    if (this._renderedComponent) {
      ReactReconciler.unmountComponent(
        this._renderedComponent,
        safely,
        skipLifecycle
      );
      this._renderedNodeType = null;
      this._renderedComponent = null;
      this._instance = null;
    }

    // Reset pending fields
    // Even if this component is scheduled for another update in ReactUpdates,
    // it would still be ignored because these fields are reset.
    this._pendingStateQueue = null;
    this._pendingReplaceState = false;
    this._pendingForceUpdate = false;
    this._pendingCallbacks = null;
    this._pendingElement = null;

    // These fields do not really need to be reset since this object is no
    // longer accessible.
    //reset内部变量，防止内存泄露
    this._context = null;
    this._rootNodeID = 0;
    this._topLevelWrapper = null;

    // Delete the reference from the instance to this internal representation
    // which allow the internals to be properly cleaned up even if the user
    // leaks a reference to the public instance.
    //将组件从map中移除，栽mountComponent中将它加入了map中
    ReactInstanceMap.remove(inst);

    // Some existing components rely on inst.props even after they've been
    // destroyed (in event handlers).
    // TODO: inst.props = null;
    // TODO: inst.state = null;
    // TODO: inst.context = null;
  },

  /**
   * Filters the context object to only contain keys specified in
   * `contextTypes`
   *
   * @param {object} context
   * @return {?object}
   * @private
   */
  _maskContext: function(context) {
    var Component = this._currentElement.type;
    var contextTypes = Component.contextTypes;
    if (!contextTypes) {
      return emptyObject;
    }
    var maskedContext = {};
    for (var contextName in contextTypes) {
      maskedContext[contextName] = context[contextName];
    }
    return maskedContext;
  },

  /**
   * Filters the context object to only contain keys specified in
   * `contextTypes`, and asserts that they are valid.
   *
   * @param {object} context
   * @return {?object}
   * @private
   */
  _processContext: function(context) {
    var maskedContext = this._maskContext(context);
    if (__DEV__) {
      var Component = this._currentElement.type;
      if (Component.contextTypes) {
        this._checkContextTypes(
          Component.contextTypes,
          maskedContext,
          'context'
        );
      }
    }
    return maskedContext;
  },

  /**
   * @param {object} currentContext
   * @return {object}
   * 子组件可以得到，父组件以及祖先组件在childContextTypes中声明的所有内容
   * @private
   */
  _processChildContext: function(currentContext) {
    var Component = this._currentElement.type;
    var inst = this._instance;
    var childContext;

    if (typeof inst.getChildContext === 'function') {
      if (__DEV__) {
        ReactInstrumentation.debugTool.onBeginProcessingChildContext();
        try {
          childContext = inst.getChildContext();
        } finally {
          ReactInstrumentation.debugTool.onEndProcessingChildContext();
        }
      } else {
        childContext = inst.getChildContext();
      }

      invariant(
        typeof Component.childContextTypes === 'object',
        '%s.getChildContext(): childContextTypes must be defined in order to ' +
        'use getChildContext().',
        this.getName() || 'ReactCompositeComponent'
      );
      if (__DEV__) {
        this._checkContextTypes(
          Component.childContextTypes,
          childContext,
          'child context'
        );
      }
      for (var name in childContext) {
        invariant(
          name in Component.childContextTypes,
          '%s.getChildContext(): key "%s" is not defined in childContextTypes.',
          this.getName() || 'ReactCompositeComponent',
          name
        );
      }
      return Object.assign({}, currentContext, childContext);
    } else {
      if (__DEV__) {
        const componentName = this.getName();

        if (!warningAboutMissingGetChildContext[componentName]) {
          warningAboutMissingGetChildContext[componentName] = true;
          warning(
            !Component.childContextTypes,
            '%s.childContextTypes is specified but there is no getChildContext() method ' +
            'on the instance. You can either define getChildContext() on %s or remove ' +
            'childContextTypes from it.',
            componentName,
            componentName,
          );
        }
      }
    }
    return currentContext;
  },

  /**
   * Assert that the context types are valid
   *
   * @param {object} typeSpecs Map of context field to a ReactPropType
   * @param {object} values Runtime values that need to be type-checked
   * @param {string} location e.g. "prop", "context", "child context"
   * @private
   */
  _checkContextTypes: function(
    typeSpecs,
    values,
    location: string,
  ) {
    if (__DEV__) {
      ReactDebugCurrentFrame.current = this._debugID;
      checkReactTypeSpec(
        typeSpecs,
        values,
        location,
        this.getName()
      );
      ReactDebugCurrentFrame.current = null;
    }
  },

  receiveComponent: function(nextElement, transaction, nextContext) {
    var prevElement = this._currentElement;
    var prevContext = this._context;

    this._pendingElement = null;

    this.updateComponent(
      transaction,
      prevElement, //当前元素
      nextElement, //当前元素的下一个状态
      prevContext,
      nextContext
    );
  },

  /**
   * If any of `_pendingElement`, `_pendingStateQueue`, or `_pendingForceUpdate`
   * is set, update the component.
   *
   * @param {ReactReconcileTransaction} transaction
   * @internal
   */
  performUpdateIfNecessary: function(transaction) {
    if (this._pendingElement != null) {
      ReactReconciler.receiveComponent(
        this,
        this._pendingElement,
        transaction,
        this._context
      );
    } else if (this._pendingStateQueue !== null || this._pendingForceUpdate) {
      this.updateComponent(
        transaction,
        this._currentElement,
        this._currentElement,
        this._context,
        this._context
      );
    } else {
      var callbacks = this._pendingCallbacks;
      this._pendingCallbacks = null;
      if (callbacks) {
        for (var j = 0; j < callbacks.length; j++) {
          transaction.getReactMountReady().enqueue(
            callbacks[j],
            this.getPublicInstance()
          );
        }
      }
      this._updateBatchNumber = null;
    }
  },

  /**
   * Perform an update to a mounted component. The componentWillReceiveProps and
   * shouldComponentUpdate methods are called, then (assuming the update isn't
   * skipped) the remaining update lifecycle methods are called and the DOM
   * representation is updated.
   *
   * By default, this implements React's rendering and reconciliation algorithm.
   * Sophisticated clients may wish to override this.
   *
   * @param {ReactReconcileTransaction} transaction
   * @param {ReactElement} prevParentElement
   * @param {ReactElement} nextParentElement
   * @param {context} nextUnmaskedContext 表示从父组件传入的完整的context，未加修饰。
   * @internal
   * @overridable
   */
  updateComponent: function(
    transaction,
    prevParentElement,
    nextParentElement,
    prevUnmaskedContext,
    nextUnmaskedContext
  ) {
    var inst = this._instance;
    invariant(
      inst != null,
      'Attempted to update component `%s` that has already been unmounted ' +
      '(or failed to mount).',
      this.getName() || 'ReactCompositeComponent'
    );

    var willReceive = false;//为了判断是否做componentWillReceivedProps操作。
    var nextContext;

    // Determine if the context has changed or not
    //context对象如果有改动，则检查propType等。
    if (this._context === nextUnmaskedContext) {
      nextContext = inst.context;
    } else {
      //这里的处理是，根据contextType生成inst可以获得使用的nextContext，有可能只是unmaskedContext的一部分。
      nextContext = this._processContext(nextUnmaskedContext);
      willReceive = true;
    }

    var prevProps = prevParentElement.props;
    var nextProps = nextParentElement.props;

    // Not a simple state update but a props update
    if (prevParentElement !== nextParentElement) { //父元素如果发生改变,说明用户自定义组件的props发生改变。
      willReceive = true;
    }

    // An update here will schedule an update but immediately set
    // _pendingStateQueue which will ensure that any state updates gets
    // immediately reconciled instead of waiting for the next batch.
    if (willReceive && inst.componentWillReceiveProps) {
      const beforeState = inst.state;
      if (__DEV__) {
        measureLifeCyclePerf(
          () => inst.componentWillReceiveProps(nextProps, nextContext),
          this._debugID,
          'componentWillReceiveProps',
        );
      } else {
        // 调用componentWillReceiveProps,如果通过setState进入的updateComponent，则没有这一步
        inst.componentWillReceiveProps(nextProps, nextContext);
      }
      const afterState = inst.state;
      //如果state发生改变，（但是如何才能发生这种情况呢，哦哦。。看到了，看下面警告。原来是对this.state直接赋值的时候会发生）
      // 则执行操作inst.updater.enqueueReplaceState(inst, afterState);
      //该操作见ReactUpdateQueue.js，afterState会存入_pendingStateQueue ,
      //而且_pendingReplaceState设为true，并且会在ReactUpdate.js 中dirtyComponents保存inst
      //internalInstance._pendingStateQueue = [completeState];
      //internalInstance._pendingReplaceState = true;
      //dirtyComponents.push(component);
      if (beforeState !== afterState) {
        inst.state = beforeState;
        inst.updater.enqueueReplaceState(inst, afterState);
        if (__DEV__) {
          warning(
            false,
            '%s.componentWillReceiveProps(): Assigning directly to ' +
            'this.state is deprecated (except inside a component\'s ' +
            'constructor). Use setState instead.',
            this.getName() || 'ReactCompositeComponent'
          );
        }
      }
    }

    // If updating happens to enqueue any new updates, we shouldn't execute new
    // callbacks until the next render happens, so stash the callbacks first.
    var callbacks = this._pendingCallbacks;
    this._pendingCallbacks = null;
    // 提前合并state,componentWillReceiveProps中调用setState不会重新渲染,在此处做合并即可,因为后面也是要调用render的
    // 这样可以避免没必要的渲染。
    // 在componentWillReceiveProps中调用setState，也是将partialState放入_pendingStateQueue，
    // 计算nextState是在componentWillReceiveProps之后进行，所以可以减少渲染次数。
    // （但是同时会将其放入脏组件数组。。这里的过程还要再走一遍（理论上，还要测试一下）。要保证不重复渲染，就要通过shouldUpdate进行判断。。
    //  测试过了，这里不会再走一遍，是在ReactReconciler.js中通过internalInstance._updateBatchNumber !== updateBatchNumber进行判断的。）
    var nextState = this._processPendingState(nextProps, nextContext);
    //调用shouldComponentUpdate给sholdUpdate赋值
    //如果通过forceUpdate进入的updateComponent，即_pendingForceUpdate不为空，则不用判断sholdComponentUpdate
    var shouldUpdate = true;
    if (!this._pendingForceUpdate) {
      var prevState = inst.state;
      shouldUpdate = willReceive || nextState !== prevState;
      if (inst.shouldComponentUpdate) {
        if (__DEV__) {
          shouldUpdate = measureLifeCyclePerf(
            () => inst.shouldComponentUpdate(nextProps, nextState, nextContext),
            this._debugID,
            'shouldComponentUpdate'
          );
        } else {
          shouldUpdate = inst.shouldComponentUpdate(nextProps, nextState, nextContext);
        }
      } else {
        if (this._compositeType === ReactCompositeComponentTypes.PureClass) {
          shouldUpdate =
            !shallowEqual(prevProps, nextProps) ||
            !shallowEqual(inst.state, nextState);
        }
      }
    }

    if (__DEV__) {
      warning(
        shouldUpdate !== undefined,
        '%s.shouldComponentUpdate(): Returned undefined instead of a ' +
        'boolean value. Make sure to return true or false.',
        this.getName() || 'ReactCompositeComponent'
      );
    }
    this._updateBatchNumber = null;//在这里将_updateBatchNumber置空。之后的步骤中如果有setState等类似操作，会引起组件的重新渲染。
    if (shouldUpdate) { //如果shouldUpdate为true，则会执行渲染，否则不会
      this._pendingForceUpdate = false;
      // Will set `this.props`, `this.state` and `this.context`.
      this._performComponentUpdate(
        nextParentElement,
        nextProps,
        nextState,
        nextContext,
        transaction,
        nextUnmaskedContext
      );
    } else {
      // If it's determined that a component should not update, we still want
      // to set props and state but we shortcut the rest of the update.
      this._currentElement = nextParentElement;
      this._context = nextUnmaskedContext;
      inst.props = nextProps;
      inst.state = nextState;
      inst.context = nextContext;
    }
    //这里的callbacks会在transaction的close阶段被调用。
    if (callbacks) {
      for (var j = 0; j < callbacks.length; j++) {
        transaction.getReactMountReady().enqueue(
          callbacks[j],             //回调
          this.getPublicInstance() //callback的上下文
        );
      }
    }
  },

  _processPendingState: function(props, context) {
    var inst = this._instance;
    var queue = this._pendingStateQueue;
    var replace = this._pendingReplaceState;
    this._pendingReplaceState = false;
    this._pendingStateQueue = null;

    if (!queue) {
      return inst.state;
    }

    if (replace && queue.length === 1) {
      return queue[0];
    }

    var nextState = replace ? queue[0] : inst.state;
    var dontMutate = true;
    for (var i = replace ? 1 : 0; i < queue.length; i++) {
      var partial = queue[i];
      let partialState = typeof partial === 'function' ?
        partial.call(inst, nextState, props, context) :
        partial;
      if (partialState) {
        if (dontMutate) {
          dontMutate = false;
          nextState = Object.assign({}, nextState, partialState);
        } else {
          Object.assign(nextState, partialState);
        }
      }
    }

    return nextState;
  },

  /**
   * Merges new props and state, notifies delegate methods of update and
   * performs update.
   *
   * @param {ReactElement} nextElement Next element
   * @param {object} nextProps Next public object to set as properties.
   * @param {?object} nextState Next object to set as state.
   * @param {?object} nextContext Next public object to set as context.
   * @param {ReactReconcileTransaction} transaction
   * @param {?object} unmaskedContext
   * @private
   */
  _performComponentUpdate: function(
    nextElement,
    nextProps,
    nextState,
    nextContext,
    transaction,
    unmaskedContext
  ) {
    var inst = this._instance;//this._instance,是指ReactElement对应的用户自定义组件实例。
    //判断自定义组件是否具有componentDidUpdate函数
    var hasComponentDidUpdate = Boolean(inst.componentDidUpdate);
    var prevProps;
    var prevState;
    var prevContext;
    if (hasComponentDidUpdate) {
      prevProps = inst.props;
      prevState = inst.state;
      prevContext = inst.context;
    }
    //render前调用componentWillUpdate
    if (inst.componentWillUpdate) {
      if (__DEV__) {
        measureLifeCyclePerf(
          () => inst.componentWillUpdate(nextProps, nextState, nextContext),
          this._debugID,
          'componentWillUpdate'
        );
      } else {
        inst.componentWillUpdate(nextProps, nextState, nextContext);
      }
    }
    //state props 等属性设置到内部变量inst上
    this._currentElement = nextElement; //更新实例的_currentElement
    this._context = unmaskedContext;
    inst.props = nextProps;
    inst.state = nextState;
    inst.context = nextContext;

    if (inst.unstable_handleError) {
      this._updateRenderedComponentWithErrorHandling(transaction, unmaskedContext);
    } else {
      // 内部会调用render方法，重新解析ReactElement并得到HTML
      this._updateRenderedComponent(transaction, unmaskedContext);
    }

    if (hasComponentDidUpdate) {
      if (__DEV__) {
        transaction.getReactMountReady().enqueue(() => {
          measureLifeCyclePerf(
            inst.componentDidUpdate.bind(inst, prevProps, prevState, prevContext),
            this._debugID,
            'componentDidUpdate'
          );
        });
      } else {
        //render后调用ComponentDidUpdate，加入ReactReconcileTransaction对列
        transaction.getReactMountReady().enqueue(
          inst.componentDidUpdate.bind(inst, prevProps, prevState, prevContext),
          inst
        );
      }
    }
  },

  /**
   * Call the component's `render` method and update the DOM accordingly.
   *
   * @param {ReactReconcileTransaction} transaction
   * @internal
   */
  _updateRenderedComponentWithErrorHandling: function(transaction, context) {
    var checkpoint = transaction.checkpoint();
    try {
      this._updateRenderedComponent(transaction, context);
    } catch (e) {
      // Roll back to checkpoint, handle error (which may add items to the transaction),
      // and take a new checkpoint
      transaction.rollback(checkpoint);
      this._instance.unstable_handleError(e);
      if (this._pendingStateQueue) {
        this._instance.state = this._processPendingState(this._instance.props, this._instance.context);
      }
      checkpoint = transaction.checkpoint();

      // Gracefully update to a clean state
      this._updateRenderedComponentWithNextElement(
        transaction,
        context,
        null,
        true /* safely */
      );

      // Try again - we've informed the component about the error, so they can render an error message this time.
      // If this throws again, the error will bubble up (and can be caught by a higher error boundary).
      this._updateRenderedComponent(transaction, context);
    }
  },

  /**
   * Call the component's `render` method and update the DOM accordingly.
   *
   * @param {ReactReconcileTransaction} transaction
   * @internal
   */
  _updateRenderedComponent: function(transaction, context) {
    //_renderValidatedComponent内部会调用render，得到ReactElement
    var nextRenderedElement = this._renderValidatedComponent();
    this._updateRenderedComponentWithNextElement(
      transaction,
      context,
      nextRenderedElement,
      false /* safely */
    );
  },

  /**
   * Call the component's `render` method and update the DOM accordingly.
   *
   * @param {ReactReconcileTransaction} transaction
   * @internal
   */
  _updateRenderedComponentWithNextElement: function(
    transaction,
    context,
    nextRenderedElement,
    safely
  ) {
    var prevComponentInstance = this._renderedComponent;
    var prevRenderedElement = prevComponentInstance._currentElement;

    var debugID = 0;
    if (__DEV__) {
      debugID = this._debugID;
    }
   // 判断是否做DOM diff。React为了简化递归diff,认为组件层级不变,
   // 且type和key不变(key用于listView等组件,很多时候我们没有设置type)才update,否则先unmount再重新mount
    if (shouldUpdateReactComponent(prevRenderedElement, nextRenderedElement)) {
      // 递归updateComponent,更新子组件的Virtual DOM
      ReactReconciler.receiveComponent( // 挂载，更新子组件都委托给了ReactReconciler处理。
        prevComponentInstance, //this._renderedComponent
        nextRenderedElement,
        transaction,
        this._processChildContext(context)
      );
    } else {
      var oldHostNode = ReactReconciler.getHostNode(prevComponentInstance);
    // 不做DOM diff,则先卸载掉,然后再加载。也就是先unMountComponent,再mountComponent
      if (!ReactFeatureFlags.prepareNewChildrenBeforeUnmountInStack) {
        ReactReconciler.unmountComponent(
          prevComponentInstance,
          safely,
          false /* skipLifecycle */
        );
      }

      var nodeType = ReactNodeTypes.getType(nextRenderedElement);
      this._renderedNodeType = nodeType;
      var child = this._instantiateReactComponent(
        nextRenderedElement,
        nodeType !== ReactNodeTypes.EMPTY /* shouldHaveDebugID */
      );
      this._renderedComponent = child;

    // mountComponent挂载组件,得到组件对应HTML
      var nextMarkup = ReactReconciler.mountComponent(
        child,
        transaction,
        this._hostParent,
        this._hostContainerInfo,
        this._processChildContext(context),
        debugID
      );

      if (ReactFeatureFlags.prepareNewChildrenBeforeUnmountInStack) {
        ReactReconciler.unmountComponent(
          prevComponentInstance,
          safely,
          false /* skipLifecycle */
        );
      }

      if (__DEV__) {
        if (debugID !== 0) {
          var childDebugIDs = child._debugID !== 0 ? [child._debugID] : [];
          ReactInstrumentation.debugTool.onSetChildren(debugID, childDebugIDs);
        }
      }
    // 将HTML插入DOM中
      this._replaceNodeWithMarkup(
        oldHostNode,
        nextMarkup,
        prevComponentInstance
      );
    }
  },

  /**
   * Overridden in shallow rendering.
   *
   * @protected
   */
  _replaceNodeWithMarkup: function(oldHostNode, nextMarkup, prevInstance) {
    ReactComponentEnvironment.replaceNodeWithMarkup(
      oldHostNode,
      nextMarkup,
      prevInstance
    );
  },

  /**
   * @protected
   */
  _renderValidatedComponentWithoutOwnerOrContext: function() {
    var inst = this._instance;
    var renderedElement;

    if (__DEV__) {
      renderedElement = measureLifeCyclePerf(
        () => inst.render(),
        this._debugID,
        'render'
      );
    } else {
      renderedElement = inst.render();
    }

    if (__DEV__) {
      // We allow auto-mocks to proceed as if they're returning null.
      if (renderedElement === undefined &&
          inst.render._isMockFunction) {
        // This is probably bad practice. Consider warning here and
        // deprecating this convenience.
        renderedElement = null;
      }
    }

    return renderedElement;
  },

  /**
   * @private
   */
  _renderValidatedComponent: function() {
    var renderedElement;
    if (__DEV__ || this._compositeType !== ReactCompositeComponentTypes.StatelessFunctional) {
      ReactCurrentOwner.current = this;
      try {
        renderedElement =
          this._renderValidatedComponentWithoutOwnerOrContext();
      } finally {
        ReactCurrentOwner.current = null;
      }
    } else {
      renderedElement =
        this._renderValidatedComponentWithoutOwnerOrContext();
    }
    invariant(
      // TODO: An `isValidNode` function would probably be more appropriate
      renderedElement === null || renderedElement === false ||
      React.isValidElement(renderedElement),
      '%s.render(): A valid React element (or null) must be returned. You may have ' +
        'returned undefined, an array or some other invalid object.',
      this.getName() || 'ReactCompositeComponent'
    );

    return renderedElement;
  },

  /**
   * Lazily allocates the refs object and stores `component` as `ref`.
   *
   * @param {string} ref Reference name.
   * @param {component} component Component to store as `ref`.
   * @final
   * @private
   */
  attachRef: function(ref, component) {
    var inst = this.getPublicInstance();
    invariant(inst != null, 'Stateless function components cannot have refs.');
    var publicComponentInstance = component.getPublicInstance();
    var refs = inst.refs === emptyObject ? (inst.refs = {}) : inst.refs;
    refs[ref] = publicComponentInstance;
  },

  /**
   * Detaches a reference name.
   *
   * @param {string} ref Name to dereference.
   * @final
   * @private
   */
  detachRef: function(ref) {
    var refs = this.getPublicInstance().refs;
    delete refs[ref];
  },

  /**
   * Get a text description of the component that can be used to identify it
   * in error messages.
   * @return {string} The name or null.
   * @internal
   */
  getName: function() {
    var type = this._currentElement.type;
    var constructor = this._instance && this._instance.constructor;
    return (
      type.displayName || (constructor && constructor.displayName) ||
      type.name || (constructor && constructor.name) ||
      null
    );
  },

  /**
   * Get the publicly accessible representation of this component - i.e. what
   * is exposed by refs and returned by render. Can be null for stateless
   * components.
   *
   * @return {ReactComponent} the public component instance.
   * @internal
   */
  getPublicInstance: function() {
    var inst = this._instance;
    if (this._compositeType === ReactCompositeComponentTypes.StatelessFunctional) {
      return null;
    }
    return inst;
  },

  // Stub
  _instantiateReactComponent: null,

};

module.exports = ReactCompositeComponent;
