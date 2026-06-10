// ── QR Code Generator (embedded, no external deps) ──
(function() {
//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        '██': '█',
        '█ ': '▀',
        ' █': '▄',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        '██': '▀',
        '█ ': '▀',
        ' █': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = '█';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += '█';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('██');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

// Browser global export
window.qrcodeGenerator = qrcode;

})();
// ─────────────────────────────────────────────────

// ═══════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════
const state = {
  currentScreen: null,
  prevScreen: null,
  walletTab: 'assets',
  address: null,
  balanceSun: 0,
  tokens: [],
  txHistory: [],
  network: 'mainnet',
  isLoading: false,
  generatedMnemonic: null,
  approvalData: null,
  txApprovalData: null,
  currentTxID: null,

  // Цена
  orgonPriceUsd: null,
  priceChange24h: 0,

  // Ресурсы (Energy, Bandwidth, Tron Power)
  resources: null,
  stakingResource: 'BANDWIDTH',
  unStakingResource: 'BANDWIDTH',

  // Голосование
  witnesses: [],
  myVotes: {},
  currentVotes: [],
  votingReward: 0,
};


// Map для хранения объектов транзакций — без data-атрибутов в HTML (CSP safe)
const txDataMap = new Map();
let txDataCounter = 0;

function storeTxData(tx) {
  const id = ++txDataCounter;
  txDataMap.set(id, tx);
  return id;
}

function getTxData(id) {
  return txDataMap.get(Number(id));
}

const NETWORKS = {
  mainnet: { name: 'Mainnet', fullNode: 'https://tr80.orgon.space', solidityNode: 'https://tr81.orgon.space' },
  testnet: { name: 'Quasar', fullNode: 'https://api.quasar.orgonscan.org', solidityNode: 'https://api.quasar.orgonscan.org' },
};

// ═══════════════════════════════════════════════════
//  SCREEN ROUTING
// ═══════════════════════════════════════════════════
function showScreen(id) {
  const prev = document.querySelector('.screen.active');
  if (prev) {
    prev.classList.add('slide-out');
    setTimeout(() => prev.classList.remove('active', 'slide-out'), 220);
  }
  const next = document.getElementById(id);
  if (next) {
    state.prevScreen = state.currentScreen;
    state.currentScreen = id;
    requestAnimationFrame(() => next.classList.add('active'));
  }
}

function goBack() {
  if (state.prevScreen) showScreen(state.prevScreen);
}

// ═══════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════
let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = type ? `show ${type}` : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ═══════════════════════════════════════════════════
//  CHROME MESSAGING
// ═══════════════════════════════════════════════════
async function sendToSW(method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'INTERNAL_REQUEST', id: `popup_${Date.now()}`, method, params },
      (response) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        if (response?.error) { reject(new Error(response.error.message)); return; }
        resolve(response?.result);
      }
    );
  });
}

// ═══════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
//  EVENT BINDING (все onclick вынесены сюда — CSP 'self')
// ═══════════════════════════════════════════════════
function bindEvents() {
  // Хелпер: безопасная привязка
  const on = (id, event, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
  };
  const onAll = (selector, event, fn) => {
    document.querySelectorAll(selector).forEach(el => el.addEventListener(event, fn));
  };

  // ── Welcome ──
  on('btn-to-create',       'click', () => showScreen('screen-create'));
  on('btn-to-import',       'click', () => showScreen('screen-import'));

  // ── Create wallet ──
  // back buttons в create и import (убираем по классу)
  document.querySelectorAll('#screen-create .back-btn').forEach(btn =>
    btn.addEventListener('click', () => showScreen('screen-welcome'))
  );
  document.querySelectorAll('#screen-import .back-btn').forEach(btn =>
    btn.addEventListener('click', () => showScreen('screen-welcome'))
  );

  on('btn-copy-mnemonic',   'click', copyMnemonic);
  on('btn-create-wallet',   'click', createWallet);

  // ── Import ──
  on('import-tab-seed', 'click', () => setImportTab('seed'));
  on('import-tab-key',  'click', () => setImportTab('key'));
  on('btn-import-wallet',   'click', importWallet);

  // ── Lock ──
  on('btn-unlock',           'click', unlockWallet);
  on('unlock-password',      'keydown', e => { if (e.key === 'Enter') unlockWallet(); });
  document.querySelectorAll('#screen-lock .back-btn').forEach(btn =>
    btn.addEventListener('click', () => showScreen('screen-welcome'))
  );
  document.querySelectorAll('#screen-lock .net-pill').forEach(el =>
    el.addEventListener('click', showNetworkSelector)
  );

  // ── Wallet main ──
  on('btn-lock',             'click', lockWallet);
  document.querySelectorAll('#screen-wallet .net-pill').forEach(el =>
    el.addEventListener('click', showNetworkSelector)
  );
  on('nav-assets',  'click', () => showWalletTab('assets'));
  on('nav-history', 'click', () => {
    showWalletTab('history');
    // Загружаем историю автоматически при первом открытии
    if (!state.txHistory || state.txHistory.length === 0) {
      loadTxHistory();
    }
  });
  on('nav-dapps',   'click', () => showWalletTab('dapps'));
  on('nav-settings','click', () => showWalletTab('settings'));

  // ── Send ──
  document.querySelectorAll('#screen-send .back-btn').forEach(btn =>
    btn.addEventListener('click', () => showScreen('screen-wallet'))
  );
  on('btn-send-max',        'click', sendMax);
  on('btn-send-tx',         'click', sendTransaction);

  // ── Receive ──
  document.querySelectorAll('#screen-receive .back-btn').forEach(btn =>
    btn.addEventListener('click', () => showScreen('screen-wallet'))
  );
  on('btn-copy-address',    'click', copyAddress);

  // ── TX detail ──
  document.querySelectorAll('#screen-tx-detail .back-btn').forEach(btn =>
    btn.addEventListener('click', () => showScreen('screen-wallet'))
  );

  // ── Approval ──
  on('btn-reject-approval', 'click', rejectApproval);
  on('btn-approve-approval','click', approveApproval);

  // ── TX Approval ──
  on('btn-reject-tx',       'click', rejectTx);
  on('btn-approve-tx',      'click', approveTx);

  // ── Voting ──
  on('btn-back-from-voting', 'click', () => showScreen('screen-wallet'));
  on('btn-voting-refresh',   'click', loadWitnesses);
  on('btn-claim-rewards',    'click', claimVotingRewards);
  on('btn-clear-votes',      'click', clearMyVotes);
  on('btn-submit-votes',     'click', submitVotes);

  document.getElementById('vote-search')?.addEventListener('input', filterWitnesses);

  // ── Staking ──
  on('btn-back-from-staking', 'click', () => showScreen('screen-wallet'));

  on('stk-tab-freeze', 'click', () => {
    document.getElementById('stk-panel-freeze').style.display = 'block';
    document.getElementById('stk-panel-unfreeze').style.display = 'none';
    document.getElementById('stk-tab-freeze').className = 'btn btn-primary';
    document.getElementById('stk-tab-unfreeze').className = 'btn btn-secondary';
  });
  on('stk-tab-unfreeze', 'click', () => {
    document.getElementById('stk-panel-freeze').style.display = 'none';
    document.getElementById('stk-panel-unfreeze').style.display = 'block';
    document.getElementById('stk-tab-freeze').className = 'btn btn-secondary';
    document.getElementById('stk-tab-unfreeze').className = 'btn btn-primary';
    loadWithdrawable();
  });

  // Выбор ресурса — Freeze
  on('stk-res-bandwidth', 'click', () => {
    state.stakingResource = 'BANDWIDTH';
    document.getElementById('stk-res-bandwidth').className = 'btn btn-primary';
    document.getElementById('stk-res-energy').className = 'btn btn-secondary';
    updateFreezePreview();
  });
  on('stk-res-energy', 'click', () => {
    state.stakingResource = 'ENERGY';
    document.getElementById('stk-res-bandwidth').className = 'btn btn-secondary';
    document.getElementById('stk-res-energy').className = 'btn btn-primary';
    updateFreezePreview();
  });
  on('stk-max-btn', 'click', () => {
    const el = document.getElementById('stk-freeze-amount');
    if (el) { el.value = Math.floor(state.balanceSun / 1e6); updateFreezePreview(); }
  });
  document.getElementById('stk-freeze-amount')?.addEventListener('input', updateFreezePreview);

  // Выбор ресурса — Unfreeze
  on('stk-unres-bandwidth', 'click', () => {
    state.unStakingResource = 'BANDWIDTH';
    document.getElementById('stk-unres-bandwidth').className = 'btn btn-primary';
    document.getElementById('stk-unres-energy').className = 'btn btn-secondary';
    updateUnfreezeMax();
  });
  on('stk-unres-energy', 'click', () => {
    state.unStakingResource = 'ENERGY';
    document.getElementById('stk-unres-bandwidth').className = 'btn btn-secondary';
    document.getElementById('stk-unres-energy').className = 'btn btn-primary';
    updateUnfreezeMax();
  });
  on('stk-unmax-btn', 'click', () => {
    const r = state.resources;
    if (!r) return;
    const max = state.unStakingResource === 'ENERGY' ? r.frozenEnergyOrgon : r.frozenBandwidthOrgon;
    const el = document.getElementById('stk-unfreeze-amount');
    if (el) el.value = Math.floor(max);
  });

  on('btn-do-freeze',    'click', doFreeze);
  on('btn-do-unfreeze',  'click', doUnfreeze);
  on('btn-do-withdraw',  'click', doWithdraw);

  // ── Export Key ──
  on('btn-back-from-export-key', 'click', () => showScreen('screen-wallet'));
  on('btn-reveal-key', 'click', revealPrivateKey);
  on('btn-copy-privkey', 'click', () => {
    const val = document.getElementById('export-key-value')?.textContent;
    if (val && val !== '—') { navigator.clipboard.writeText(val); toast('Ключ скопирован', 'success'); }
  });
  on('btn-hide-key', 'click', () => {
    document.getElementById('export-key-result').style.display = 'none';
    document.getElementById('export-key-confirm').style.display = 'block';
    document.getElementById('export-key-password').value = '';
    document.getElementById('export-key-value').textContent = '—';
  });

  // ── Export Seed ──
  on('btn-back-from-export-seed', 'click', () => showScreen('screen-wallet'));
  on('btn-reveal-seed', 'click', revealSeedPhrase);
  on('btn-copy-seed', 'click', () => {
    const words = [...document.querySelectorAll('#export-seed-grid .word')].map(w => w.textContent);
    if (words.length) { navigator.clipboard.writeText(words.join(' ')); toast('Seed скопирован', 'success'); }
  });
  on('btn-hide-seed', 'click', () => {
    document.getElementById('export-seed-result').style.display = 'none';
    document.getElementById('export-seed-confirm').style.display = 'block';
    document.getElementById('export-seed-password').value = '';
    document.getElementById('export-seed-grid').innerHTML = '';
  });

  // ── Network selector ──
  document.querySelectorAll('#screen-network .back-btn').forEach(btn =>
    btn.addEventListener('click', goBack)
  );
  on('net-mainnet', 'click', () => switchNetwork('mainnet'));
  on('net-testnet',  'click', () => switchNetwork('testnet'));
}

async function init() {
  bindEvents();
  // Проверяем URL params — это approval popup?
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type');
  const requestId = params.get('requestId');
  const data = params.get('data') ? JSON.parse(params.get('data')) : null;

  if (type === 'connect' && requestId) {
    state.approvalData = { requestId, ...data };
    document.getElementById('approval-origin').textContent = data?.origin || '—';
    document.getElementById('approval-address').textContent =
      state.address?.base58 || 'Подключите кошелёк';
    showScreen('screen-approval');
    return;
  }

  if (type === 'transaction' && requestId) {
    // Передаём requestId вместе с data — он нужен в approveTx/rejectTx
    showTxApproval({ requestId, ...data });
    return;
  }

  // Обычный popup — проверяем состояние кошелька
  try {
    const swState = await sendToSW('__internal.getState');
    if (swState?.isUnlocked && swState?.selectedAddress) {
      state.address = swState.selectedAddress;
      state.network = 'mainnet';
      showScreen('screen-wallet');
      showWalletTab('assets');
      loadBalance();
      // Автообновление баланса каждые 10 секунд пока popup открыт
      setInterval(() => {
        if (state.currentScreen === 'screen-wallet') loadBalance();
      }, 10_000);
      // Загружаем курс ORGON/USDT с Blazarex
      loadOrgonPrice();
      setInterval(loadOrgonPrice, 60_000);
    } else {
      // Есть ли vault?
      const hasVault = await checkVaultExists();
      showScreen(hasVault ? 'screen-lock' : 'screen-welcome');
    }
  } catch {
    showScreen('screen-welcome');
  }

  // Генерируем мнемонику для экрана создания
  await generateMnemonic();
}

async function checkVaultExists() {
  return new Promise(resolve => {
    chrome.storage.local.get('orgonlink_vault', data => resolve(!!data.orgonlink_vault));
  });
}

// ═══════════════════════════════════════════════════
//  MNEMONIC GENERATION (demo — в продакшне @scure/bip39)
// ═══════════════════════════════════════════════════
async function generateMnemonic() {
  try {
    const mnemonic = await sendToSW('__internal.generateMnemonic');
    state.generatedMnemonic = mnemonic.split(' ');
  } catch {
    // Фолбэк если SW ещё не инициализирован (первый запуск)
    const fallback = 'abandon ability able about above absent absorb abstract absurd abuse access accident'.split(' ');
    state.generatedMnemonic = fallback;
  }
  const grid = document.getElementById('mnemonic-display');
  if (!grid) return;
  grid.innerHTML = state.generatedMnemonic.map((w, i) =>
    `<div class="mnemonic-word">
      <span class="num">${i+1}</span>
      <span class="word">${w}</span>
    </div>`
  ).join('');
}

function copyMnemonic() {
  if (state.generatedMnemonic) {
    navigator.clipboard.writeText(state.generatedMnemonic.join(' '));
    toast('Seed-фраза скопирована', 'success');
  }
}

// ═══════════════════════════════════════════════════
//  WALLET CREATION / IMPORT
// ═══════════════════════════════════════════════════
async function createWallet() {
  const pw = document.getElementById('create-password').value;
  const pw2 = document.getElementById('create-password2').value;
  if (pw.length < 8) { toast('Минимум 8 символов', 'error'); return; }
  if (pw !== pw2) { toast('Пароли не совпадают', 'error'); return; }

  try {
    const result = await sendToSW('__internal.createWallet', {
      mnemonic: state.generatedMnemonic.join(' '),
      password: pw
    });
    state.address = result.address;
    showScreen('screen-wallet');
    showWalletTab('assets');
    loadBalance();
    toast('Кошелёк создан!', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function importWallet() {
  const tab = document.getElementById('import-tab-seed').classList.contains('btn-secondary') ? 'seed' : 'key';
  const pw = document.getElementById('import-password').value;
  const pw2 = document.getElementById('import-password2').value;
  if (pw.length < 8) { toast('Минимум 8 символов', 'error'); return; }
  if (pw !== pw2) { toast('Пароли не совпадают', 'error'); return; }

  try {
    let result;
    if (tab === 'seed') {
      const mnemonic = document.getElementById('import-mnemonic').value.trim();
      if (!mnemonic) { toast('Введите seed-фразу', 'error'); return; }
      result = await sendToSW('__internal.createWallet', { mnemonic, password: pw });
    } else {
      const pk = document.getElementById('import-privkey').value.trim();
      if (!pk) { toast('Введите приватный ключ', 'error'); return; }
      result = await sendToSW('__internal.importWallet', { privateKey: pk, password: pw });
    }
    state.address = result.address;
    showScreen('screen-wallet');
    showWalletTab('assets');
    loadBalance();
    toast('Кошелёк импортирован', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

function setImportTab(tab) {
  document.getElementById('import-seed-panel').style.display = tab === 'seed' ? '' : 'none';
  document.getElementById('import-key-panel').style.display = tab === 'key' ? '' : 'none';
  document.getElementById('import-tab-seed').className = `btn ${tab==='seed'?'btn-secondary':'btn-ghost'}`;
  document.getElementById('import-tab-key').className = `btn ${tab==='key'?'btn-secondary':'btn-ghost'}`;
  document.getElementById('import-tab-seed').style.cssText = 'flex:1;height:36px;font-size:12px;';
  document.getElementById('import-tab-key').style.cssText = 'flex:1;height:36px;font-size:12px;';
}

// ═══════════════════════════════════════════════════
//  LOCK / UNLOCK
// ═══════════════════════════════════════════════════
async function unlockWallet() {
  const pw = document.getElementById('unlock-password').value;
  if (!pw) { toast('Введите пароль', 'error'); return; }
  try {
    await sendToSW('__internal.unlock', { password: pw });
    const s = await sendToSW('__internal.getState');
    state.address = s.selectedAddress;
    document.getElementById('unlock-password').value = '';
    showScreen('screen-wallet');
    showWalletTab('assets');
    loadBalance();
  } catch (e) {
    toast('Неверный пароль', 'error');
    document.getElementById('unlock-password').value = '';
  }
}

async function lockWallet() {
  await sendToSW('__internal.lock');
  state.address = null;
  state.balanceSun = 0;
  showScreen('screen-lock');
}

// ═══════════════════════════════════════════════════
//  WALLET TABS
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
//  TAB EVENT BINDING (динамический контент)
// ═══════════════════════════════════════════════════
function bindTabEvents(tab) {
  const on = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };

  if (tab === 'assets') {
    on('tab-copy-addr',      copyAddress);
    on('tab-btn-send',       openSend);
    on('tab-btn-staking',    openStaking);
    on('tab-btn-receive',    () => { showScreen('screen-receive'); renderQR(); });
    on('tab-btn-swap',       () => toast('Обмен — скоро'));
    on('tab-btn-staking',    openStaking);
    on('tab-btn-add-token',  () => toast('Добавление токена — скоро'));
  }

  if (tab === 'history') {
    on('tab-btn-refresh-history', loadTxHistory);
    // Event delegation для tx-row
    const content = document.getElementById('wallet-tab-content');
    if (content) {
      content.addEventListener('click', e => {
        const row = e.target.closest('[data-txid]');
        if (row) {
          const tx = getTxData(row.dataset.txid);
          if (tx) showTxDetail(tx);
        }
      });
    }
  }

  if (tab === 'settings') {
    on('tab-btn-copy-settings',  copyAddress);
    on('tab-row-network',        showNetworkSelector);
    on('tab-row-export-key',  () => openExportKey());
    on('tab-row-staking',     () => openStaking());
    on('tab-row-voting',      () => openVoting());
    on('tab-row-export-seed', () => openExportSeed());
    on('tab-row-about',          () => toast('OrgonLink v0.1.0'));
    on('tab-btn-reset',          resetWallet);
    // tab-btn-explorer привязывается в showTxDetail напрямую
  }
}

function showWalletTab(tab) {
  state.walletTab = tab;
  ['assets','history','dapps','settings'].forEach(t => {
    document.getElementById(`nav-${t}`)?.classList.toggle('active', t === tab);
  });
  const content = document.getElementById('wallet-tab-content');
  if (!content) return;

  switch(tab) {
    case 'assets':   content.innerHTML = renderAssetsTab(); break;
    case 'history':
      content.innerHTML = renderHistoryTab();
      // Автозагрузка если история ещё не загружена
      if (!state.txHistory || state.txHistory.length === 0) {
        loadTxHistory();
      }
      break;
    case 'dapps':    content.innerHTML = renderDappsTab(); break;
    case 'settings': content.innerHTML = renderSettingsTab(); break;
  }
  bindTabEvents(tab);
}

// ─── Assets tab ───────────────────────────────────
function renderAssetsTab() {
  const addr = state.address?.base58 || '—';
  const addrShort = addr !== '—' ? addr.slice(0,8)+'...'+addr.slice(-6) : '—';
  const orgon = (state.balanceSun / 1_000_000).toFixed(6);
  const price = state.orgonPriceUsd ?? 0;
  const usd = (state.balanceSun / 1_000_000 * price).toFixed(2);

  const tokensHtml = state.tokens.length > 0
    ? state.tokens.map(t => `
      <div class="token-row">
        <div class="token-icon orc20">${t.symbol.slice(0,2)}</div>
        <div class="token-info">
          <div class="token-name">${t.symbol}</div>
          <div class="token-sub">${t.name}</div>
        </div>
        <div class="token-right">
          <div class="token-amount">${t.balance}</div>
          <div class="token-usd">$${t.usd}</div>
        </div>
      </div>`).join('')
    : `<div class="p16 text-center muted fs12" style="padding:24px 16px;">
        <div style="margin-bottom:8px;">oRC-20 токены не найдены</div>
        <span style="color:var(--text3);">Добавьте контракт вручную</span>
      </div>`;

  return `
    <div class="balance-hero">
      <div class="balance-amount" id="balance-display">${state.isLoading ? '...' : orgon}</div>
      <div class="balance-usd">≈ $${usd} USD</div>
      <div class="balance-change up" style="margin: 8px auto 12px; display:inline-flex;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
        +0.00%
      </div>
      <div class="address-chip" id="tab-copy-addr">
        <div class="address-avatar"></div>
        <span class="address-text">${addrShort}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      </div>
    </div>

    <div class="action-row">
      <button class="action-btn send" id="tab-btn-send">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Отправить
      </button>
      <button class="action-btn receive" id="tab-btn-receive">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        Получить
      </button>
      <button class="action-btn swap" id="tab-btn-swap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
        Обменять
      </button>
    </div>

    <div style="background:var(--bg2);border-top:1px solid var(--border);border-bottom:1px solid var(--border);">
      <div class="token-row">
        <div class="token-icon orgon">ORG</div>
        <div class="token-info">
          <div class="token-name">ORGON</div>
          <div class="token-sub">Нативный токен</div>
        </div>
        <div class="token-right">
          <div class="token-amount accent">${orgon}</div>
          <div class="token-usd">$${usd}</div>
        </div>
      </div>
      ${tokensHtml}
    </div>

    <div style="padding:16px;text-align:center;">
      <button class="btn btn-ghost" style="width:auto;height:34px;font-size:12px;gap:6px;" id="tab-btn-add-token">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        Добавить токен
      </button>
    </div>`;
}

// ─── History tab ──────────────────────────────────

function renderResourcesBlock() {
  const r = state.resources;
  if (!r) {
    // Загружаем ресурсы если ещё не загружены
    sendToSW('trx.getAccountResource', { address: state.address?.base58 })
      .then(res => {
        state.resources = res;
        const el = document.getElementById('tab-resources-block');
        if (el) el.innerHTML = renderResourcesBlock();
      }).catch(() => {});
    return '<div class="fs11 muted text-center" style="padding:8px;">Загрузка ресурсов...</div>';
  }

  const bwPct = r.bwTotal > 0 ? Math.min(100, Math.round(r.bwAvail / r.bwTotal * 100)) : 0;
  const enPct = r.energyLimit > 0 ? Math.min(100, Math.round(r.energyAvail / r.energyLimit * 100)) : 0;

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="card-sm" style="cursor:pointer;" onclick="">
        <div class="flex justify-between flex-center mb4">
          <span class="fs11 muted">Bandwidth</span>
          <span class="fs11 accent fw600">${r.bwAvail.toLocaleString()}</span>
        </div>
        <div style="height:3px;background:var(--border2);border-radius:2px;">
          <div style="height:100%;background:var(--accent);border-radius:2px;width:${bwPct}%;"></div>
        </div>
        ${r.frozenBandwidth > 0 ? `<div class="fs11 muted mt4">❄️ ${r.frozenBandwidthOrgon.toFixed(2)} ORGON</div>` : ''}
      </div>
      <div class="card-sm">
        <div class="flex justify-between flex-center mb4">
          <span class="fs11 muted">Energy</span>
          <span class="fs11 fw600" style="color:var(--amber);">${r.energyAvail.toLocaleString()}</span>
        </div>
        <div style="height:3px;background:var(--border2);border-radius:2px;">
          <div style="height:100%;background:var(--amber);border-radius:2px;width:${enPct}%;"></div>
        </div>
        ${r.frozenEnergy > 0 ? `<div class="fs11 muted mt4">❄️ ${r.frozenEnergyOrgon.toFixed(2)} ORGON</div>` : ''}
      </div>
    </div>
    ${r.tronPower > 0 ? `<div class="flex justify-between flex-center mt8 px16" style="padding:6px 0;"><span class="fs11 muted">Tron Power (голоса)</span><span class="fs11 fw600 accent">${r.tronPowerOrgon.toFixed(2)} TP</span></div>` : ''}
  `;
}

function renderHistoryTab() {
  if (state.isLoading) return '<div class="p16 text-center muted loading" style="padding:40px;">Загрузка...</div>';

  const mockTxs = state.txHistory ?? [];

  if (mockTxs.length === 0) return `
    <div class="section-hdr">
      <span class="section-title">Транзакции</span>
      <button class="btn-ghost" style="height:28px;font-size:11px;padding:0 10px;" id="tab-btn-refresh-history">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
      </button>
    </div>
    <div style="padding:48px 16px;text-align:center;">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5" style="margin:0 auto 12px;display:block;"><path d="M3 12a9 9 0 109-9M3 12V6M3 12H9"/></svg>
      <div class="muted fs13" style="margin-bottom:12px;">История транзакций пуста</div>
      <div class="muted" style="font-size:11px;">Нажмите ⟳ чтобы обновить</div>
    </div>`;

  const iconSvgs = {
    out: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`,
    in:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>`,
    contract: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  };

  return `
    <div class="section-hdr">
      <span class="section-title">Транзакции</span>
      <button class="btn-ghost" style="height:28px;font-size:11px;padding:0 10px;" id="tab-btn-refresh-history">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
      </button>
    </div>
    ${mockTxs.map(tx => `
      <div class="tx-row" data-txid="${storeTxData(tx)}">
        <div class="tx-icon ${tx.type}">${iconSvgs[tx.type]}</div>
        <div class="tx-info">
          <div class="tx-type">${tx.label}</div>
          <div class="tx-addr">${tx.addr}</div>
        </div>
        <div class="tx-right">
          <div class="tx-amount ${tx.type==='in'?'accent':tx.type==='out'?'red':''}">${tx.amount}</div>
          <div class="tx-date">${tx.date}</div>
          <span class="tx-status ${tx.status}">${tx.status==='confirmed'?'Подтверждено':tx.status==='pending'?'Ожидание':'Ошибка'}</span>
        </div>
      </div>`).join('')}`;
}

// ─── dApps tab ────────────────────────────────────
function renderDappsTab() {
  const connected = [
    { name: 'OrgonSwap', url: 'orgonswap.io', icon: '🔄' },
    { name: 'OrgonNFT', url: 'orgonnft.space', icon: '🎨' },
  ];

  const connectedHtml = connected.length > 0
    ? connected.map(d => `
      <div class="settings-row">
        <div class="settings-row-icon" style="font-size:18px;">${d.icon}</div>
        <div class="settings-row-text">
          <div class="settings-row-title">${d.name}</div>
          <div class="settings-row-sub">${d.url}</div>
        </div>
        <button class="btn-ghost" style="height:28px;font-size:11px;padding:0 10px;color:var(--red);border-color:var(--red-dim);">
          Отозвать
        </button>
      </div>`).join('')
    : `<div class="p16 text-center muted fs12">Нет подключённых dApp</div>`;

  return `
    <div class="section-hdr" style="padding-top:16px;">
      <span class="section-title">Подключённые сайты</span>
    </div>
    ${connectedHtml}
    <div style="padding:20px 16px;text-align:center;">
      <div class="muted fs12" style="line-height:1.6;">
        Сайты получают доступ к вашему адресу и могут запрашивать подпись транзакций.
        Отзовите доступ в любой момент.
      </div>
    </div>`;
}

// ─── Settings tab ─────────────────────────────────
function renderSettingsTab() {
  const addr = state.address?.base58 || '—';
  const net = NETWORKS[state.network]?.name || 'Mainnet';

  return `
    <div style="padding:16px 16px 8px;">
      <div class="card-sm mb16">
        <div class="label mb6">Адрес кошелька</div>
        <div class="mono fs11 muted" style="word-break:break-all;line-height:1.6;">${addr}</div>
        <button class="btn-ghost" style="height:28px;font-size:11px;padding:0 10px;margin-top:8px;" id="tab-btn-copy-settings">Скопировать</button>
      </div>
    </div>

    <div class="settings-row" id="tab-row-network">
      <div class="settings-row-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
      </div>
      <div class="settings-row-text">
        <div class="settings-row-title">Сеть</div>
        <div class="settings-row-sub">${net}</div>
      </div>
      <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>

    <div class="settings-row" id="tab-row-staking">
        <div class="settings-row-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <div class="settings-row-text">
          <div class="settings-row-title">Заморозка / Ресурсы</div>
          <div class="settings-row-sub">Energy, Bandwidth, Tron Power</div>
        </div>
        <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>

    <div class="settings-row" id="tab-row-voting">
        <div class="settings-row-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        </div>
        <div class="settings-row-text">
          <div class="settings-row-title">Голосование</div>
          <div class="settings-row-sub">Валидаторы, награды, Tron Power</div>
        </div>
        <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>

    <div class="settings-row" id="tab-row-export-key">
      <div class="settings-row-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      </div>
      <div class="settings-row-text">
        <div class="settings-row-title">Экспорт приватного ключа</div>
        <div class="settings-row-sub" style="color:var(--red);">Только в безопасном месте</div>
      </div>
      <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>

    <div class="settings-row" id="tab-row-export-seed">
      <div class="settings-row-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <div class="settings-row-text">
        <div class="settings-row-title">Показать seed-фразу</div>
        <div class="settings-row-sub">12 секретных слов</div>
      </div>
      <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>

    <div class="settings-row" id="tab-row-about">
      <div class="settings-row-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div class="settings-row-text">
        <div class="settings-row-title">О расширении</div>
        <div class="settings-row-sub">OrgonLink v0.1.0</div>
      </div>
      <div class="settings-row-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>

    <div style="padding:20px 16px;">
      <button class="btn btn-danger" id="tab-btn-reset">Сбросить кошелёк</button>
    </div>`;
}

// ═══════════════════════════════════════════════════
//  BALANCE LOADING
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
//  PRICE LOADING — Blazarex public API
// ═══════════════════════════════════════════════════
async function loadOrgonPrice() {
  // Blazarex Public API — точный эндпоинт
  // Формат: { price: 0.0006, askPrice: 0.00056, bidPrice: 0.0, ... }
  const url = 'https://public-api.blazarex.com/api/tickers?currencyPairCode=ORGON_USDT';
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    console.log('[Price] Blazarex:', JSON.stringify(data));

    // Используем askPrice если > 0, иначе price
    const price = parseFloat(data.askPrice > 0 ? data.askPrice : data.price) || 0;
    if (price > 0) {
      state.orgonPriceUsd = price;
      state.priceChange24h = parseFloat(data.priceChangePercentage24h) || 0;
      updatePriceDisplay();
    }
  } catch (e) {
    console.warn('[Price] Blazarex failed:', e.message);
  }
}

function updatePriceDisplay() {
  const price = state.orgonPriceUsd;
  const orgon = state.balanceSun / 1_000_000;
  const orgonStr = orgon.toFixed(6);
  const usdVal = (price !== null && price !== undefined && !isNaN(price))
    ? (orgon * price).toFixed(2)
    : '0.00';
  const change = state.priceChange24h ?? 0;
  const changeStr = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
  const changeClass = change >= 0 ? 'up' : 'down';

  // Баланс цифрами вверху
  const balEl = document.getElementById('balance-display');
  if (balEl) balEl.textContent = orgonStr;

  // USD под балансом
  const usdEl = document.querySelector('.balance-usd');
  if (usdEl) usdEl.textContent = `≈ $${usdVal} USD`;

  // Индикатор изменения за 24ч
  const changeEl = document.querySelector('.balance-change');
  if (changeEl) {
    changeEl.className = `balance-change ${changeClass}`;
    changeEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${
      change >= 0 ? '<polyline points="18 15 12 9 6 15"/>' : '<polyline points="6 9 12 15 18 9"/>'
    }</svg> ${changeStr}`;
  }

  // Строка токена ORGON — сумма
  const tokenAmountEl = document.querySelector('.token-amount.accent');
  if (tokenAmountEl) tokenAmountEl.textContent = orgonStr;

  // Строка токена ORGON — USD
  const tokenUsdEl = document.querySelector('.token-usd');
  if (tokenUsdEl) tokenUsdEl.textContent = `$${usdVal}`;

  // Подзаголовок токена — цена за 1 ORGON
  const tokenSubEls = document.querySelectorAll('.token-sub');
  tokenSubEls.forEach(el => {
    if (el.textContent.includes('Нативный токен')) {
      el.textContent = price
        ? `$${Number(price).toFixed(6)} · Нативный токен`
        : 'Нативный токен';
    }
  });

  // Баланс на экране отправки
  const sb = document.getElementById('send-balance');
  if (sb) sb.textContent = orgonStr + ' ORGON';
}

async function loadBalance() {
  if (!state.address) return;

  try {
    const raw = await sendToSW('trx.getBalance', { address: state.address.base58 });
    // raw может быть: число, строка, undefined, null, объект {balance:N}
    let newBalance = 0;
    if (typeof raw === 'number') {
      newBalance = raw;
    } else if (typeof raw === 'string') {
      newBalance = parseInt(raw, 10) || 0;
    } else if (raw && typeof raw === 'object') {
      // на случай если SW вернул объект аккаунта целиком
      newBalance = parseInt(raw.balance ?? raw.Balance ?? 0, 10) || 0;
    }

    state.balanceSun = newBalance;
    const orgon = (state.balanceSun / 1_000_000).toFixed(6);

    const el = document.getElementById('balance-display');
    if (el) el.textContent = orgon;
    updatePriceDisplay();

    console.log('[Balance]', orgon, 'ORGON (raw:', raw, ')');
  } catch (e) {
    console.warn('[Balance] load failed:', e.message, e.stack?.slice(0,200));
  }

  const fa = document.getElementById('send-from-addr');
  if (fa) fa.textContent = state.address?.base58 ?? '—';
}

async function loadTxHistory() {
  if (!state.address) return;
  toast('Загрузка истории...');

  try {
    const txs = await sendToSW('trx.getTransactions', { address: state.address.base58, limit: 20 });

    if (!Array.isArray(txs) || txs.length === 0) {
      // Нет транзакций — перерисовываем таб с пустым состоянием
      state.txHistory = [];
      if (state.walletTab === 'history') showWalletTab('history');
      return;
    }

    // Парсим транзакции — реальный формат gate.orgon.space / quasargate.orgon.space
    // Адреса в ответе — HEX (73xxxx), не base58
    // Мой адрес в base58 — state.address.base58 (начинается с 'o')
    // Для сравнения берём hex адрес: убираем префикс 73 и сравниваем
    const myHex = state.address.hex?.toLowerCase() ?? '';

    state.txHistory = txs.map(tx => {
      const contract = tx.raw_data?.contract?.[0];
      const type = contract?.type ?? 'Unknown';
      const value = contract?.parameter?.value ?? {};

      const ownerHex = (value.owner_address ?? '').toLowerCase();
      const toHex    = (value.to_address ?? '').toLowerCase();
      const isSend   = ownerHex === myHex || ownerHex === myHex.replace(/^73/, '');

      // Контрагент — сокращённый hex адрес
      const counterHex = isSend ? toHex : ownerHex;
      const addrShort  = counterHex.length > 8
        ? counterHex.slice(0, 6) + '...' + counterHex.slice(-4)
        : '—';

      const ts   = tx.block_timestamp ?? tx.raw_data?.timestamp ?? 0;
      const date = ts ? new Date(ts).toLocaleString('ru-RU', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      }) : '—';

      const confirmed = tx.ret?.[0]?.contractRet === 'SUCCESS';
      const statusStr = confirmed ? 'confirmed' : 'pending';

      let txType, label, amountStr;

      if (type === 'TransferContract') {
        const orgon = ((value.amount ?? 0) / 1_000_000).toFixed(6);
        txType    = isSend ? 'out' : 'in';
        label     = isSend ? 'Отправлено' : 'Получено';
        amountStr = (isSend ? '−' : '+') + orgon + ' ORGON';
      } else if (type === 'TransferAssetContract') {
        const amt = ((value.amount ?? 0) / 1_000_000).toFixed(6);
        txType    = isSend ? 'out' : 'in';
        label     = 'Токен ' + (isSend ? 'отправлен' : 'получен');
        amountStr = (isSend ? '−' : '+') + amt;
      } else if (type === 'TriggerSmartContract') {
        txType    = 'contract';
        label     = 'Смарт-контракт';
        amountStr = 'oRC-20';
      } else {
        txType    = 'contract';
        label     = type.replace('Contract', '');
        amountStr = '—';
      }

      return { type: txType, label, addr: addrShort, amount: amountStr,
               usd: '', date, status: statusStr, txID: tx.txID };
    });

    if (state.walletTab === 'history') showWalletTab('history');
    toast('История обновлена', 'success');

  } catch (e) {
    console.warn('TX history failed:', e.message);
    toast('Ошибка загрузки истории', 'error');
  }
}

// ═══════════════════════════════════════════════════
//  SEND
// ═══════════════════════════════════════════════════
function openSend() {
  showScreen('screen-send');
  const fromEl = document.getElementById('send-from-addr');
  const balEl = document.getElementById('send-balance');
  if (fromEl) fromEl.textContent = state.address?.base58 || '—';
  if (balEl) balEl.textContent = (state.balanceSun / 1_000_000).toFixed(6) + ' ORGON';
}

function sendMax() {
  const fee = 100000; // 0.1 ORGON в SUN
  const maxSun = Math.max(0, state.balanceSun - fee);
  const el = document.getElementById('send-amount');
  if (el) el.value = (maxSun / 1_000_000).toFixed(6);
}

async function sendTransaction() {
  const to   = document.getElementById('send-to')?.value?.trim();
  const amountStr = document.getElementById('send-amount')?.value?.trim();

  if (!to)         { toast('Введите адрес получателя', 'error'); return; }
  if (!to.startsWith('o')) { toast('Неверный адрес (должен начинаться с "o")', 'error'); return; }
  if (!amountStr || isNaN(parseFloat(amountStr))) { toast('Введите сумму', 'error'); return; }

  const amountSun = Math.round(parseFloat(amountStr) * 1_000_000);
  if (amountSun <= 0)              { toast('Сумма должна быть больше 0', 'error'); return; }
  if (amountSun > state.balanceSun){ toast('Недостаточно средств', 'error'); return; }
  if (to === state.address?.base58){ toast('Нельзя отправить самому себе', 'error'); return; }

  // Блокируем кнопку
  const btn = document.getElementById('btn-send-tx');
  if (btn) { btn.disabled = true; btn.textContent = 'Отправка...'; }

  try {
    // Один вызов — создание + подпись + broadcast внутри SW
    const result = await sendToSW('wallet.sendOrgon', {
      to,
      amount: amountSun,
      from: state.address?.base58,
    });

    toast('✓ Отправлено! TX: ' + (result.txid ?? result.transaction_id ?? '').slice(0, 12) + '...', 'success');
    document.getElementById('send-to').value = '';
    document.getElementById('send-amount').value = '';

    setTimeout(() => {
      showScreen('screen-wallet');
      showWalletTab('assets');
      loadBalance();
      setTimeout(loadTxHistory, 3000); // история обновится через 3с после broadcast
    }, 1500);

  } catch (e) {
    toast(e.message || 'Ошибка отправки', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Отправить'; }
  }
}

// ═══════════════════════════════════════════════════
//  RECEIVE / QR
// ═══════════════════════════════════════════════════
function renderQR() {
  const addr = state.address?.base58 || '';
  const addrEl = document.getElementById('receive-address');
  if (addrEl) addrEl.textContent = addr;

  const canvas = document.getElementById('qr-canvas');
  if (!canvas || !addr) return;

  try {
    // qrcode-generator API: qrcode(typeNumber, errorCorrectionLevel)
    const qr = window.qrcodeGenerator(0, 'M'); // typeNumber 0 = авто
    qr.addData(addr);
    qr.make();

    const size = qr.getModuleCount();
    const canvasSize = 136;
    const cell = Math.floor(canvasSize / (size + 2)); // +2 для margin
    const offset = Math.floor((canvasSize - cell * size) / 2);

    const ctx = canvas.getContext('2d');
    // Белый фон
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    // Чёрные модули
    ctx.fillStyle = '#000000';
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(offset + col * cell, offset + row * cell, cell, cell);
        }
      }
    }
  } catch(e) {
    console.error('QR render error:', e);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 136, 136);
    ctx.fillStyle = '#333';
    ctx.font = '11px monospace';
    ctx.fillText('QR error', 40, 70);
  }
}

function copyAddress() {
  const addr = state.address?.base58;
  if (addr) {
    navigator.clipboard.writeText(addr);
    toast('Адрес скопирован', 'success');
  }
}

// ═══════════════════════════════════════════════════
//  TX DETAIL
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
//  EXPORT PRIVATE KEY / SEED PHRASE
// ═══════════════════════════════════════════════════


// ═══════════════════════════════════════════════════
//  STAKING: Freeze / Unfreeze / Resources
// ═══════════════════════════════════════════════════


// ═══════════════════════════════════════════════════
//  VOTING: Голосование за валидаторов
// ═══════════════════════════════════════════════════

async function openVoting() {
  showScreen('screen-voting');
  await loadVotingData();
}

async function loadVotingData() {
  // Сначала загружаем ресурсы (нужны для TP счётчиков)
  if (!state.resources) {
    try {
      state.resources = await sendToSW('trx.getAccountResource',
        { address: state.address?.base58 });
    } catch {}
  }
  // Параллельно загружаем остальное
  await Promise.all([
    loadWitnesses(),
    loadCurrentVotes(),
    loadVotingReward(),
  ]);
  updateVoteTP();
}

async function loadWitnesses() {
  document.getElementById('witness-list').innerHTML =
    '<div class="p16 text-center muted loading" style="padding:32px;">Загрузка...</div>';
  try {
    const witnesses = await sendToSW('wallet.listWitnesses');
    console.log('[Voting] raw witnesses count:', witnesses?.length, 'first:', JSON.stringify(witnesses?.[0]).slice(0, 100));
    state.witnesses = (witnesses ?? [])
      .filter(w => w && w.address)
      .sort((a, b) => (b.voteCount ?? 0) - (a.voteCount ?? 0));
    console.log('[Voting] filtered witnesses:', state.witnesses.length);
    renderWitnessList(state.witnesses);
    document.getElementById('vote-witness-count').textContent =
      state.witnesses.length + ' валидаторов';
  } catch (e) {
    document.getElementById('witness-list').innerHTML =
      `<div class="p16 text-center muted">Ошибка загрузки: ${e.message}</div>`;
  }
}

async function loadCurrentVotes() {
  try {
    const votes = await sendToSW('wallet.getAccountVotes');
    state.currentVotes = votes ?? [];
    // Инициализируем черновик из текущих голосов
    if (Object.keys(state.myVotes).length === 0 && votes.length > 0) {
      votes.forEach(v => {
        state.myVotes[v.vote_address] = v.vote_count;
      });
    }
    renderMyVotes();
  } catch {}
}

async function loadVotingReward() {
  try {
    const reward = await sendToSW('wallet.getReward');
    state.votingReward = reward ?? 0;
    document.getElementById('vote-reward').textContent =
      (state.votingReward / 1e6).toFixed(6) + ' ORGON';
    document.getElementById('btn-claim-rewards').style.display =
      state.votingReward > 0 ? 'block' : 'none';
  } catch {}
}

function updateVoteTP() {
  const r = state.resources;
  if (!r) return; // ресурсы ещё не загружены
  const tpTotal = Math.floor(r.tronPowerOrgon ?? 0);
  const tpUsed  = Object.values(state.myVotes ?? {}).reduce((s, v) => s + Number(v || 0), 0);
  const tpAvail = Math.max(0, tpTotal - tpUsed);

  document.getElementById('vote-tp-total').textContent = tpTotal + ' TP';
  document.getElementById('vote-tp-used').textContent  = tpUsed + ' TP';
  document.getElementById('vote-tp-avail').textContent = tpAvail + ' TP';
  document.getElementById('vote-distributed').textContent = tpUsed + ' / ' + tpTotal + ' TP';

  const bar = document.getElementById('vote-submit-bar');
  if (bar) bar.style.display = tpUsed > 0 ? 'block' : 'none';
}

function renderWitnessList(witnesses) {
  const search = document.getElementById('vote-search')?.value?.toLowerCase() ?? '';
  const filtered = search
    ? witnesses.filter(w =>
        (w.url ?? '').toLowerCase().includes(search) ||
        (w.address ?? '').toLowerCase().includes(search))
    : witnesses;

  if (filtered.length === 0) {
    document.getElementById('witness-list').innerHTML =
      '<div class="p16 text-center muted">Валидаторы не найдены</div>';
    return;
  }

  document.getElementById('witness-list').innerHTML = filtered.filter(w => w?.address).map((w, i) => {
    const name    = extractWitnessName(w.url ?? w.address);
    const votes   = (w.voteCount ?? 0).toLocaleString();
    const produce = w.totalProduced ?? 0;
    const missed  = w.totalMissed ?? 0;
    const rate    = produce > 0 ? Math.round(produce / (produce + missed) * 100) : 0;
    const isTop27 = w.isJobs || i < 27;
    const myVote  = state.myVotes[w.address] ?? 0;

    return `
    <div class="witness-row" data-addr="${w.address}" style="
      display:flex;align-items:center;gap:10px;
      padding:11px 16px;border-bottom:1px solid var(--border);
      cursor:pointer;transition:background .12s;
      ${myVote > 0 ? 'background:var(--accent-dim);' : ''}
    ">
      <!-- Ранг -->
      <div style="min-width:28px;text-align:center;">
        <div class="mono fw600 fs12" style="color:${isTop27 ? 'var(--accent)' : 'var(--text3)'};">#${i+1}</div>
      </div>
      <!-- Иконка -->
      <div style="width:34px;height:34px;border-radius:50%;flex-shrink:0;
        background:${isTop27 ? 'var(--accent-dim)' : 'var(--bg3)'};
        display:flex;align-items:center;justify-content:center;
        font-size:13px;font-weight:700;font-family:var(--mono);
        color:${isTop27 ? 'var(--accent)' : 'var(--text3)'};">
        ${name.slice(0,2).toUpperCase()}
      </div>
      <!-- Инфо -->
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;
          overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${name}
          ${isTop27 ? '<span style="font-size:9px;background:var(--accent-dim);color:var(--accent);padding:1px 5px;border-radius:3px;margin-left:4px;">SR</span>' : ''}
        </div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px;">
          ${votes} голосов · ${rate}% надёжность
        </div>
      </div>
      <!-- Голос -->
      <div style="text-align:right;flex-shrink:0;">
        ${myVote > 0
          ? `<div class="mono fw600 fs12 accent">${myVote} TP</div>
             <div style="font-size:10px;color:var(--accent);cursor:pointer;"
               data-vote-addr="${w.address}">✕ убрать</div>`
          : `<button class="btn btn-secondary" data-vote-addr="${w.address}"
               style="height:28px;font-size:11px;padding:0 10px;width:auto;">
               Голос
             </button>`
        }
      </div>
    </div>`;
  }).join('');

  // Привязываем клики
  document.querySelectorAll('[data-vote-addr]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const addr = el.dataset.voteAddr;
      if (el.textContent.includes('убрать') || el.textContent.includes('✕')) {
        removeVote(addr);
      } else {
        openVoteInput(addr);
      }
    });
  });
}

function extractWitnessName(url) {
  if (!url) return 'Unknown';
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url.length > 20 ? url.slice(0, 20) + '...' : url;
  }
}

function renderMyVotes() {
  const entries = Object.entries(state.myVotes ?? {}).filter(([, v]) => v > 0);
  const section = document.getElementById('my-votes-section');
  const list    = document.getElementById('my-votes-list');
  if (!section || !list) return;

  section.style.display = entries.length > 0 ? 'block' : 'none';

  list.innerHTML = entries.map(([addr, count]) => {
    const w    = state.witnesses.find(x => x.address === addr);
    const name = w ? extractWitnessName(w.url ?? addr) : addr.slice(0, 10) + '...';
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;
      padding:10px 16px;border-bottom:1px solid var(--border);">
      <div>
        <div class="fs13 fw600">${name}</div>
        <div class="mono fs11 muted">${addr.slice(0,8)}...${addr.slice(-4)}</div>
      </div>
      <div style="text-align:right;">
        <div class="mono fw600 accent fs13">${count} TP</div>
        <div class="fs11" style="color:var(--red);cursor:pointer;" data-remove-vote="${addr}">убрать</div>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-remove-vote]').forEach(el => {
    el.addEventListener('click', () => removeVote(el.dataset.removeVote));
  });
}

function openVoteInput(addr) {
  const r = state.resources;
  const tpTotal = r ? Math.floor(r.tronPowerOrgon) : 0;
  const tpUsed  = Object.values(state.myVotes ?? {}).reduce((s, v) => s + Number(v || 0), 0);
  const tpAvail = tpTotal - tpUsed + (state.myVotes[addr] ?? 0);

  if (tpAvail <= 0) {
    toast('Нет доступных TP. Заморозьте ORGON.', 'error');
    return;
  }

  const input = prompt(
    `Сколько голосов (TP) отдать за этого валидатора?\nДоступно: ${tpAvail} TP`,
    state.myVotes[addr] ?? ''
  );

  if (input === null) return;
  const count = parseInt(input);
  if (isNaN(count) || count <= 0) { delete state.myVotes[addr]; }
  else if (count > tpAvail)       { toast(`Максимум ${tpAvail} TP`, 'error'); return; }
  else                             { state.myVotes[addr] = count; }

  renderMyVotes();
  renderWitnessList(state.witnesses);
  updateVoteTP();
}

function removeVote(addr) {
  delete state.myVotes[addr];
  renderMyVotes();
  renderWitnessList(state.witnesses);
  updateVoteTP();
}

function clearMyVotes() {
  state.myVotes = {};
  renderMyVotes();
  renderWitnessList(state.witnesses);
  updateVoteTP();
}

function filterWitnesses() {
  renderWitnessList(state.witnesses);
}

async function submitVotes() {
  const votes = Object.entries(state.myVotes ?? {})
    .filter(([, count]) => count > 0)
    .map(([vote_address, vote_count]) => ({ vote_address, vote_count }));

  if (votes.length === 0) { toast('Нет распределённых голосов', 'error'); return; }

  const btn = document.getElementById('btn-submit-votes');
  if (btn) { btn.disabled = true; btn.textContent = 'Голосование...'; }

  try {
    await sendToSW('wallet.voteWitness', { votes });
    toast(`✓ Проголосовано за ${votes.length} валидаторов!`, 'success');

    // Голоса зафиксированы — сбрасываем черновик и скрываем кнопку
    state.myVotes = {};

    // Обновляем данные с блокчейна
    await loadCurrentVotes();
    await loadVotingReward();
    updateVoteTP();
    renderWitnessList(state.witnesses);

    // Скрываем панель с кнопкой
    const bar = document.getElementById('vote-submit-bar');
    if (bar) bar.style.display = 'none';

  } catch (e) {
    toast(e.message || 'Ошибка голосования', 'error');
    // При ошибке — восстанавливаем кнопку
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Проголосовать';
    }
  }
}

async function claimVotingRewards() {
  const btn = document.getElementById('btn-claim-rewards');
  if (btn) { btn.disabled = true; btn.textContent = 'Получение...'; }
  try {
    await sendToSW('wallet.withdrawVotingRewards');
    toast('✓ Награды получены!', 'success');
    state.votingReward = 0;
    document.getElementById('vote-reward').textContent = '0.000000 ORGON';
    document.getElementById('btn-claim-rewards').style.display = 'none';
    await loadBalance();
  } catch (e) {
    toast(e.message || 'Ошибка вывода наград', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Получить'; }
  }
}

async function openStaking() {
  showScreen('screen-staking');
  await loadResources();
}

async function loadResources() {
  try {
    const r = await sendToSW('trx.getAccountResource', { address: state.address?.base58 });
    state.resources = r;
    renderResources(r);
  } catch (e) {
    console.warn('[Staking] loadResources failed:', e.message);
  }
}

function renderResources(r) {
  if (!r) return;

  // Bandwidth bar
  const bwPct = r.bwTotal > 0 ? Math.min(100, Math.round(r.bwAvail / r.bwTotal * 100)) : 0;
  document.getElementById('stk-bw-avail').textContent = r.bwAvail.toLocaleString() + ' / ' + r.bwTotal.toLocaleString();
  document.getElementById('stk-bw-bar').style.width = bwPct + '%';
  document.getElementById('stk-bw-frozen').textContent = r.frozenBandwidthOrgon.toFixed(2) + ' ORGON';

  // Energy bar
  const enPct = r.energyLimit > 0 ? Math.min(100, Math.round(r.energyAvail / r.energyLimit * 100)) : 0;
  document.getElementById('stk-en-avail').textContent = r.energyAvail.toLocaleString() + ' / ' + r.energyLimit.toLocaleString();
  document.getElementById('stk-en-bar').style.width = enPct + '%';
  document.getElementById('stk-en-frozen').textContent = r.frozenEnergyOrgon.toFixed(2) + ' ORGON';

  // Tron Power
  document.getElementById('stk-tp').textContent = r.tronPowerOrgon.toFixed(2) + ' TP';
  document.getElementById('stk-balance').textContent = 'Баланс: ' + (state.balanceSun / 1e6).toFixed(2) + ' ORGON';

  updateUnfreezeMax();
}

function updateFreezePreview() {
  const amount = parseFloat(document.getElementById('stk-freeze-amount')?.value) || 0;
  const el = document.getElementById('stk-will-get');
  if (el) el.textContent = amount > 0
    ? `${amount.toFixed(2)} TP + ${state.stakingResource === 'ENERGY' ? 'Energy' : 'Bandwidth'}`
    : '— TP + ресурс';
}

function updateUnfreezeMax() {
  const r = state.resources;
  if (!r) return;
  const max = state.unStakingResource === 'ENERGY' ? r.frozenEnergyOrgon : r.frozenBandwidthOrgon;
  const el = document.getElementById('stk-avail-unfreeze');
  if (el) el.textContent = max.toFixed(2) + ' ORGON';
}

async function loadWithdrawable() {
  try {
    const result = await sendToSW('wallet.getCanWithdrawUnfreeze');
    const amount = (result?.amount ?? 0) / 1e6;
    const section = document.getElementById('stk-withdraw-section');
    const amtEl   = document.getElementById('stk-withdraw-amount');
    if (section) section.style.display = amount > 0 ? 'block' : 'none';
    if (amtEl)   amtEl.textContent = amount.toFixed(6) + ' ORGON';
  } catch {}
}

async function doFreeze() {
  const amountOrgon = parseFloat(document.getElementById('stk-freeze-amount')?.value);
  if (!amountOrgon || amountOrgon < 1) { toast('Минимум 1 ORGON', 'error'); return; }
  if (amountOrgon * 1e6 > state.balanceSun) { toast('Недостаточно средств', 'error'); return; }

  const btn = document.getElementById('btn-do-freeze');
  if (btn) { btn.disabled = true; btn.textContent = 'Заморозка...'; }

  try {
    const result = await sendToSW('wallet.freezeBalanceV2', {
      amount:   Math.round(amountOrgon * 1e6),
      resource: state.stakingResource,
    });
    toast(`✓ Заморожено ${amountOrgon} ORGON для ${state.stakingResource}`, 'success');
    document.getElementById('stk-freeze-amount').value = '';
    await loadBalance();
    await loadResources();
  } catch (e) {
    toast(e.message || 'Ошибка заморозки', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '❄️ Заморозить'; }
  }
}

async function doUnfreeze() {
  const amountOrgon = parseFloat(document.getElementById('stk-unfreeze-amount')?.value);
  if (!amountOrgon || amountOrgon < 1) { toast('Введите сумму', 'error'); return; }

  const r = state.resources;
  const max = r ? (state.unStakingResource === 'ENERGY' ? r.frozenEnergyOrgon : r.frozenBandwidthOrgon) : 0;
  if (amountOrgon > max) { toast(`Максимум ${max.toFixed(2)} ORGON`, 'error'); return; }

  const btn = document.getElementById('btn-do-unfreeze');
  if (btn) { btn.disabled = true; btn.textContent = 'Разморозка...'; }

  try {
    await sendToSW('wallet.unfreezeBalanceV2', {
      amount:   Math.round(amountOrgon * 1e6),
      resource: state.unStakingResource,
    });
    toast(`✓ Разморозка ${amountOrgon} ORGON начата. Средства придут через 14 дней.`, 'success');
    document.getElementById('stk-unfreeze-amount').value = '';
    await loadResources();
    await loadWithdrawable();
  } catch (e) {
    toast(e.message || 'Ошибка разморозки', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔥 Разморозить'; }
  }
}

async function doWithdraw() {
  const btn = document.getElementById('btn-do-withdraw');
  if (btn) { btn.disabled = true; btn.textContent = 'Получение...'; }
  try {
    await sendToSW('wallet.withdrawExpireUnfreeze');
    toast('✓ ORGON успешно выведен на баланс!', 'success');
    document.getElementById('stk-withdraw-section').style.display = 'none';
    await loadBalance();
  } catch (e) {
    toast(e.message || 'Ошибка вывода', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Получить'; }
  }
}

function openExportKey() {
  // Сбрасываем состояние экрана
  document.getElementById('export-key-result').style.display = 'none';
  document.getElementById('export-key-confirm').style.display = 'block';
  document.getElementById('export-key-password').value = '';
  document.getElementById('export-key-value').textContent = '—';
  showScreen('screen-export-key');
  setTimeout(() => document.getElementById('export-key-password')?.focus(), 300);
}

function openExportSeed() {
  document.getElementById('export-seed-result').style.display = 'none';
  document.getElementById('export-seed-confirm').style.display = 'block';
  document.getElementById('export-seed-password').value = '';
  document.getElementById('export-seed-grid').innerHTML = '';
  showScreen('screen-export-seed');
  setTimeout(() => document.getElementById('export-seed-password')?.focus(), 300);
}

async function revealPrivateKey() {
  const password = document.getElementById('export-key-password')?.value?.trim();
  if (!password) { toast('Введите пароль', 'error'); return; }

  const btn = document.getElementById('btn-reveal-key');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    console.log('[Export] calling exportPrivateKey...');
    const privKey = await sendToSW('__internal.exportPrivateKey', { password });
    console.log('[Export] privKey received:', privKey ? privKey.slice(0,8)+'...' : 'null');
    document.getElementById('export-key-value').textContent = privKey;
    document.getElementById('export-key-confirm').style.display = 'none';
    document.getElementById('export-key-result').style.display = 'block';
  } catch (e) {
    toast(e.message || 'Неверный пароль', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Показать ключ';
    }
  }
}

async function revealSeedPhrase() {
  const password = document.getElementById('export-seed-password')?.value?.trim();
  if (!password) { toast('Введите пароль', 'error'); return; }

  const btn = document.getElementById('btn-reveal-seed');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    console.log('[Export] calling exportMnemonic, isLocked check...');
    const swState = await sendToSW('__internal.getState');
    console.log('[Export] SW state:', JSON.stringify(swState));
    const mnemonic = await sendToSW('__internal.exportMnemonic', { password });
    console.log('[Export] mnemonic received, length:', mnemonic?.length);
    const words = mnemonic.trim().split(/\s+/);
    const grid = document.getElementById('export-seed-grid');
    grid.innerHTML = words.map((w, i) => `
      <div class="mnemonic-word">
        <span class="num">${i + 1}</span>
        <span class="word">${w}</span>
      </div>`).join('');
    document.getElementById('export-seed-confirm').style.display = 'none';
    document.getElementById('export-seed-result').style.display = 'block';
  } catch (e) {
    toast(e.message || 'Неверный пароль', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Показать seed-фразу';
    }
  }
}

function showTxDetail(tx) {
  state.currentTxID = tx.txID ?? null;  // сохраняем для кнопки эксплорера
  document.getElementById('tx-detail-content').innerHTML = `
    <div class="p16">
      <div class="text-center" style="padding:20px 0 16px;">
        <div class="tx-icon ${tx.type}" style="width:52px;height:52px;margin:0 auto 10px;">
          ${tx.type === 'in'
            ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>'
            : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>'}
        </div>
        <div style="font-size:28px;font-weight:700;font-family:'Consolas','SF Mono','Courier New',monospace;" class="${tx.type==='in'?'accent':'red'}">${tx.amount}</div>
        <div class="muted fs12 mt4">${tx.usd}</div>
        <span class="tx-status ${tx.status}" style="margin-top:8px;display:inline-block;">${tx.status==='confirmed'?'Подтверждено':tx.status==='pending'?'Ожидание':'Ошибка'}</span>
      </div>

      <div class="card">
        <div class="fee-row"><span class="muted">Тип</span><span class="fs13">${tx.label}</span></div>
        <div class="fee-row"><span class="muted">Адрес</span><span class="mono fs11 truncate" style="max-width:160px;">${tx.addr}</span></div>
        <div class="fee-row"><span class="muted">Дата</span><span class="fs12">${tx.date}</span></div>
        <div class="fee-row"><span class="muted">Комиссия</span><span class="fs12">${tx.fee ? (tx.fee/1e6).toFixed(6)+' ORGON' : '0.1 ORGON'}</span></div>
        <div class="fee-row" style="border:none;padding-top:8px;">
          <span class="muted">TX ID</span>
          <span class="mono" style="font-size:10px;color:var(--text3);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tx.txID ? tx.txID.slice(0,20)+'...' : '—'}</span>
        </div>
      </div>

      <button class="btn btn-secondary mt16" id="tab-btn-explorer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
        Открыть в OrgonScan
      </button>
    </div>`;
  showScreen('screen-tx-detail');

  // Привязываем кнопку после вставки HTML
  const explorerBtn = document.getElementById('tab-btn-explorer');
  if (explorerBtn) {
    explorerBtn.addEventListener('click', () => {
      const txid = state.currentTxID;
      if (!txid) { toast('TX ID недоступен', 'error'); return; }
      const explorerBase = state.network === 'testnet'
        ? 'https://quasar.orgonscan.org'
        : 'https://orgonscan.org';
      const url = `${explorerBase}/transaction/${txid}`;
      chrome.tabs.create({ url });
    });
  }
}

// ═══════════════════════════════════════════════════
//  APPROVAL HANDLING
// ═══════════════════════════════════════════════════
async function approveApproval() {
  if (!state.approvalData) return;
  try {
    await sendToSW('__internal.approveRequest', {
      requestId: state.approvalData.requestId, approved: true
    });
    window.close();
  } catch (e) { toast(e.message, 'error'); }
}

async function rejectApproval() {
  if (!state.approvalData) return;
  await sendToSW('__internal.approveRequest', {
    requestId: state.approvalData.requestId, approved: false
  });
  window.close();
}

function showTxApproval(data) {
  // Сохраняем requestId — он нужен для approveRequest в SW
  state.txApprovalData = data;
  console.log('[Approval] txApprovalData.requestId:', data?.requestId);
  document.getElementById('tx-approval-origin').textContent = data?.origin || '—';

  const tx = data?.transaction ?? {};
  const details = document.getElementById('tx-approval-details');
  if (details) {
    details.innerHTML = `
      <div class="label mb10">Детали транзакции</div>
      <div class="fee-row"><span class="muted">Тип</span><span class="fs12">${tx.raw_data?.contract?.[0]?.type ?? 'TransferContract'}</span></div>
      <div class="fee-row"><span class="muted">Сумма</span><span class="mono fs12 accent">${((tx.raw_data?.contract?.[0]?.parameter?.value?.amount ?? 0) / 1e6).toFixed(6)} ORGON</span></div>
      <div class="fee-row" style="border:none;"><span class="muted">ID</span><span class="mono fs11 truncate" style="max-width:140px;">${tx.txID?.slice(0,16) ?? '—'}...</span></div>`;
  }

  const feeEl = document.getElementById('tx-fee-limit');
  if (feeEl) feeEl.textContent = ((tx.raw_data?.fee_limit ?? 150000000) / 1e6).toFixed(1) + ' ORGON';

  showScreen('screen-tx-approval');
}

async function approveTx() {
  if (!state.txApprovalData) {
    console.error('[Approval] txApprovalData is null!');
    toast('Ошибка: данные транзакции недоступны', 'error');
    return;
  }
  const { requestId } = state.txApprovalData;
  if (!requestId) {
    console.error('[Approval] requestId is missing!', state.txApprovalData);
    toast('Ошибка: requestId недоступен', 'error');
    return;
  }
  console.log('[Approval] approving requestId:', requestId);

  const btn = document.getElementById('btn-approve-tx');
  if (btn) { btn.disabled = true; btn.textContent = 'Подтверждение...'; }

  try {
    await sendToSW('__internal.approveRequest', { requestId, approved: true });
    console.log('[Approval] approved successfully');
    window.close();
  } catch (e) {
    console.error('[Approval] error:', e.message);
    toast('Ошибка подтверждения: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Подтвердить'; }
  }
}

async function rejectTx() {
  if (!state.txApprovalData) return;
  const { requestId } = state.txApprovalData;
  if (!requestId) return;
  console.log('[Approval] rejecting requestId:', requestId);
  await sendToSW('__internal.approveRequest', { requestId, approved: false });
  window.close();
}

// ═══════════════════════════════════════════════════
//  NETWORK
// ═══════════════════════════════════════════════════
let netFromScreen = null;

function showNetworkSelector() {
  netFromScreen = state.currentScreen;
  // Обновляем чекмарки
  document.querySelectorAll('.network-option').forEach(el => el.classList.remove('selected'));
  document.getElementById(`net-${state.network}`)?.classList.add('selected');
  showScreen('screen-network');
}

async function switchNetwork(net) {
  state.network = net;
  try {
    await sendToSW('__internal.switchNetwork', { network: net });
  } catch { /* ignore */ }

  const name = NETWORKS[net]?.name || 'Mainnet';
  document.querySelectorAll('[id$="-net-name"]').forEach(el => el.textContent = name);

  // Обновляем чекмарки
  document.querySelectorAll('.network-option').forEach(el => el.classList.remove('selected'));
  document.getElementById(`net-${net}`)?.classList.add('selected');

  toast(`Сеть: ${name}`, 'success');
  if (netFromScreen) showScreen(netFromScreen);
}

// ═══════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════
async function resetWallet() {
  if (!confirm('Сбросить кошелёк? Убедитесь что seed-фраза сохранена!')) return;
  chrome.storage.local.remove(['orgonlink_vault', 'orgonlink_permissions'], () => {
    state.address = null;
    state.balanceSun = 0;
    showScreen('screen-welcome');
  });
}

// ═══════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════
// Если chrome API недоступен (dev preview) — фолбэк
if (typeof chrome === 'undefined' || !chrome.runtime) {
  window.chrome = {
    runtime: {
      sendMessage: (msg, cb) => setTimeout(() => cb({ result: null }), 100),
      lastError: null,
    },
    storage: { local: {
      get: (k, cb) => cb({}),
      remove: (k, cb) => cb && cb(),
      set: (d, cb) => cb && cb(),
    }},
  };
}

document.addEventListener('DOMContentLoaded', init);