var marexandre;
(function($, window, document, undefined) {
  'use strict';

  var pluginName = 'textareaHighlighter';
  var helper = new marexandre.Helper();

  var TextareaHighlighter = function($el, options) {
    this.$element  = $el;
    this.element   = this.$element[0];
    this.settings  = $.extend( {}, TextareaHighlighter.DEFAULTS, this.$element.data(), options );

    this.$wrapDiv       = $(document.createElement('div')).addClass('textarea-highlighter-wrap');
    this.$backgroundDiv = $(document.createElement('div')).addClass('background-div ' + this.$element.attr('class') );
    this.$autoSize      = $('<pre><div class="autosize"></div></pre>').addClass( this.$element.attr('class') ).hide();
    this.$autoSizeElement = this.$autoSize.find('.autosize');

    this.init();
  };

  TextareaHighlighter.DEFAULTS = {
    word_base: true,
    matches: [
      // {'matchClass': '', 'match': []}
    ],
    maxlength        : -1,
    maxlengthWarning : '',
    maxlengthElement : null,
    isAutoExpand     : true,
    typingDelay      : 30,
    debug            : false
  };

  TextareaHighlighter.prototype.init = function() {
    var _this          = this,
        $this          = this.$element,
        settings       = this.settings,
        $wrapDiv       = this.$wrapDiv,
        $backgroundDiv = this.$backgroundDiv;

    // Remove duplicates from 'match'
    for (var i = 0, imax = settings.matches.length; i < imax; i++) {
      settings.matches[i].match = helper.getUniqueArray(settings.matches[i].match);
    }

    _this.updateStyle();

    // insert backgroundDiv
    $this.wrap( $wrapDiv ).before( $backgroundDiv );
    // Insert auto resize div
    if (settings.isAutoExpand) {
      $this.after( _this.$autoSize );
    }

    _this.updateHeight();
    _this.bindEvents();
    _this.highlight();
  };

  TextareaHighlighter.prototype.bindEvents = function() {
    var _this = this;
    var $this = this.$element;

    $this
      .data('highlighterTimerId', -1)
      // Watch on scroll event
      .on('scroll.textarea.highlighter', function() {
        _this.$backgroundDiv.scrollTop( $this.scrollTop() );
      });

    if ('onpropertychange' in _this.element) {
      var lastUpdate = new Date().getTime();
      var timeDiff = 0;
      var abs = Math.abs;
      // IE 9+
      $this.on('input.textarea.highlighter keyup.textarea.highlighter', function(e) {
        timeDiff = abs(lastUpdate - new Date().getTime());

        if (timeDiff > 10) {
          _this.change(e);
          lastUpdate = new Date().getTime();
        }
      });
      // For backspace long press
      $this.on('keydown.textarea.highlighter', function(e) {
        timeDiff = abs(lastUpdate - new Date().getTime());

        if (e.which === 8 && (timeDiff < 10 || 250 < timeDiff)) {
          _this.change(e);
          lastUpdate = new Date().getTime();
        }
      });
    } else {
      // Modern browsers
      $this.on('input.textarea.highlighter', function(e) {
        _this.change(e);
      });
    }
  };

  TextareaHighlighter.prototype.change = function(e) {
    var _this = this;

    // if arrow keys, don't do anything
    if (/(37|38|39|40)/.test(e.keyCode)) {
      return true;
    }

    _this.updateHeight();

    // TODO: replace this stupid thing with proper 'throttle'
    // check for last update, this is for performace
    if (_this.$element.data('highlighterTimerId') !== -1) {
      clearTimeout( _this.$element.data('highlighterTimerId') );
      _this.$element.data('highlighterTimerId', -1);
    }

    // id for set timeout
    var changeId = setTimeout(function() {
      _this.highlight();
    }, _this.settings.typingDelay);
    // set setTimeout id
    _this.$element.data('highlighterTimerId', changeId);
  };

  TextareaHighlighter.prototype.highlight = function() {
    var _this = this;
    var text = _this.$element.val();
    var settings = _this.settings;
    var overMaxText = '';
    var notOverMaxText = '';

    if (text.length === 0) {
      _this.$backgroundDiv.html('');
      return;
    }

    // check for max length
    if (0 < settings.maxlength) {
      if (settings.maxlength < text.length) {
        // get text that was over max length
        overMaxText = text.slice(settings.maxlength, settings.maxlength + text.length - 1);
        // escape HTML
        overMaxText = helper.escapeHTML(overMaxText);
        // wrap matched text with <span> tags
        overMaxText = helper.getTextInSpan(settings.maxlengthWarning, overMaxText);
      }

      _this.updateCharLimitElement(text);
      // set text that wasn't over max length
      notOverMaxText = text.slice(0, settings.maxlength);
    }
    else {
      notOverMaxText = text;
    }
    // Escape HTML content
    notOverMaxText = helper.escapeHTML(notOverMaxText);
    notOverMaxText = _this.getHighlightedContent(notOverMaxText);

    _this.$backgroundDiv.html( notOverMaxText + overMaxText );
    _this.$element.trigger('textarea.highlighter.highlight');
  };

  TextareaHighlighter.prototype.getHighlightedContent = function(text) {
    var _this = this;
    var list = _this.settings.matches;
    var indeciesList = [];
    var item, trieIndecies;

    for (var i = 0, imax = list.length; i < imax; i++) {
      item = list[i];

      if (!item._trie) {
        item._trie = new marexandre.Trie();
        // HTML escape matching words
        for (var j = 0, jmax = item.match.length; j < jmax; j++) {
          item._trie.add( helper.escapeHTML(item.match[j]) );
        }
      }

      trieIndecies = item._trie.getIndecies(text);
      trieIndecies = helper.removeOverlapingIndecies(trieIndecies);

      indeciesList.push({ 'indecies': trieIndecies, 'type': item.matchClass });
    }

    var flattened = helper.flattenIndeciesList(indeciesList);
    flattened = helper.orderBy(flattened, 'start');
    flattened = helper.removeOverlapingIndecies(flattened);
    flattened = helper.cleanupOnWordBoundary(text, flattened, _this.settings.word_base);

    return helper.createHTML( helper.makeTokenized(text, flattened) );
  };

  TextareaHighlighter.prototype.updateCharLimitElement = function(text) {
    var _this = this;
    var settings = _this.settings;
    // update text max length
    if (settings.maxlengthElement !== null) {
      var maxSize = settings.maxlength - text.length;

      if (maxSize < 0) {
        // add max length warning class
        if (!settings.maxlengthElement.hasClass( settings.maxlengthWarning )) {
          settings.maxlengthElement.addClass( settings.maxlengthWarning );
        }
      }
      else {
        // remove max length warning class
        if (settings.maxlengthElement.hasClass( settings.maxlengthWarning )) {
          settings.maxlengthElement.removeClass( settings.maxlengthWarning );
        }
      }
      // update max length
      settings.maxlengthElement.text(maxSize);
    }
  };


  TextareaHighlighter.prototype.updateMatches = function(matches) {
    var _this = this;
    _this.settings.matches = matches;
    _this.highlight();
  };

  TextareaHighlighter.prototype.updateStyle = function() {
    var _this    = this;
    var $this    = this.$element;
    var settings = this.settings;
    var style = {
      paddingTop   : parseInt( $this.css('padding-top'), 10 ),
      paddingRight : parseInt( $this.css('padding-right'), 10 ),
      paddingBottom: parseInt( $this.css('padding-bottom'), 10 ),
      paddingLeft  : parseInt( $this.css('padding-left'), 10 )
    };

    // Hack for iPhone
    if (helper.browser().iphone) {
      style.paddingRight += 3;
      style.paddingLeft += 3;
    }

    // wrap div
    this.$wrapDiv.css({
      'position': 'relative'
    });

    // background div
    this.$backgroundDiv.css({
      'position'      : 'absolute',
      'height'        : '100%',
      'font-family'   : 'inherit',
      'color'         : ( settings.debug ) ? '#f00' : 'transparent',
      'padding-top'   : style.paddingTop,
      'padding-right' : style.paddingRight,
      'padding-bottom': style.paddingBottom,
      'padding-left'  : style.paddingLeft
    });
    _this.cloneCSSToTarget( _this.$backgroundDiv );

    if (settings.isAutoExpand) {
      // auto size div
      _this.$autoSize.css({
        'top'           : 0,
        'left'          : 0,
        'font-family'   : 'inherit',
        'position'      : 'absolute',
        'padding-top'   : style.paddingTop,
        'padding-right' : style.paddingRight,
        'padding-bottom': style.paddingBottom,
        'padding-left'  : style.paddingLeft
      });
      _this.cloneCSSToTarget( _this.$autoSize );
    }

    // text area element
    $this.css({
      'color'     : ( settings.debug ) ? 'rgba(0,0,0,0.5)' : 'inherit',
      'position'  : 'relative',
      'background': 'none'
    });
  };

  TextareaHighlighter.prototype.updateHeight = function() {
    var _this = this;

    if (_this.settings.isAutoExpand) {
      _this.$autoSizeElement.html(helper.escapeHTML( helper.sanitizeBreakLines(_this.$element.val()) ) + ' ');
      var h = _this.$autoSize.height();
      // If the height of textarea changed then update it
      if (_this.$element.height() !== h) {
        _this.$element.height(h);
        _this.$backgroundDiv.height(h);
      }
    }
  };

  TextareaHighlighter.prototype.cloneCSSToTarget = function($t) {
    var $element = this.$element;
    var cloneCSSProperties = [
      'lineHeight', 'textDecoration', 'letterSpacing',
      'fontSize', 'fontStyle',
      'fontWeight', 'textTransform', 'textAlign',
      'direction', 'wordSpacing', 'fontSizeAdjust',
      'wordWrap', 'word-break',
      'marginLeft', 'marginRight',
      'marginTop','marginBottom',
      'borderLeftWidth', 'borderRightWidth',
      'borderTopWidth','borderBottomWidth',
      'boxSizing', 'webkitBoxSizing', 'mozBoxSizing', 'msBoxSizing'
    ];
    var val = null;

    $.each(cloneCSSProperties, function(i, p) {
      val = $element.css(p);
      // Only set if different to prevent overriding percentage css values.
      if ($t.css(p) !== val) {
        $t.css(p, val);
      }
    });
  };

  TextareaHighlighter.prototype.destroy = function() {
    $.data( this.element, 'plugin_' + pluginName, false );
    this.$backgroundDiv.remove();
    this.$autoSize.remove();
    this.$element
      .data('highlighterTimerId', -1)
      // unbind all events
      .off('scroll.textarea.highlighter')
      .off('input.textarea.highlighter')
      .off('keyup.textarea.highlighter')
      .off('propertychange.textarea.highlighter')
      // reset all styles
      .attr('style', '')
      .unwrap();
  };

  TextareaHighlighter.prototype.debugModeOn = function() {
    this.settings.debug = true;
    this.$backgroundDiv.css({ 'color': '#f00' });
    this.$element.css({ 'color': 'rgba(0,0,0,0.5)' });
  };

  TextareaHighlighter.prototype.debugModeOff = function() {
    this.settings.debug = false;
    this.$backgroundDiv.css({ 'color': 'transparent' });
    this.$element.css({ 'color': 'inherit' });
  };

  $.fn.textareaHighlighter = function(option) {
    var args = arguments;

    return this.each(function() {
      var $this = $(this);
      var data = $this.data(pluginName);
      var options = typeof option === 'object' && option;

      // If no options or plugin was NOT initialized yet, do NOT do anything.
      if (!option || (!data && typeof option === 'string')) {
        return;
      }

      if (!data) {
        data = new TextareaHighlighter($this, options);
        $this.data(pluginName, data);
      }

      if (typeof option === 'string') {
        if (!data[option]) {
          throw 'Unknown method: ' + option;
        }

        data[option].apply(data, Array.prototype.slice.call(args, 1));
      }
    });
  };

})(jQuery, window, document);
