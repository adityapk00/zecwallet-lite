/* eslint-disable */
/**
 * @fileoverview gRPC-Web generated client stub for cash.z.wallet.sdk.rpc
 * @enhanceable
 * @public
 */

// GENERATED CODE -- DO NOT EDIT!



const grpc = {};
grpc.web = require('grpc-web');


var compact_formats_pb = require('./compact_formats_pb.js')
const proto = {};
proto.cash = {};
proto.cash.z = {};
proto.cash.z.wallet = {};
proto.cash.z.wallet.sdk = {};
proto.cash.z.wallet.sdk.rpc = require('./service_pb.js');

/**
 * @param {string} hostname
 * @param {?Object} credentials
 * @param {?Object} options
 * @constructor
 * @struct
 * @final
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerClient =
    function(hostname, credentials, options) {
  if (!options) options = {};
  options['format'] = 'text';

  /**
   * @private @const {!grpc.web.GrpcWebClientBase} The client
   */
  this.client_ = new grpc.web.GrpcWebClientBase(options);

  /**
   * @private @const {string} The hostname
   */
  this.hostname_ = hostname;

};


/**
 * @param {string} hostname
 * @param {?Object} credentials
 * @param {?Object} options
 * @constructor
 * @struct
 * @final
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerPromiseClient =
    function(hostname, credentials, options) {
  if (!options) options = {};
  options['format'] = 'text';

  /**
   * @private @const {!grpc.web.GrpcWebClientBase} The client
   */
  this.client_ = new grpc.web.GrpcWebClientBase(options);

  /**
   * @private @const {string} The hostname
   */
  this.hostname_ = hostname;

};


/**
 * @const
 * @type {!grpc.web.MethodDescriptor<
 *   !proto.cash.z.wallet.sdk.rpc.ChainSpec,
 *   !proto.cash.z.wallet.sdk.rpc.BlockID>}
 */
const methodDescriptor_CompactTxStreamer_GetLatestBlock = new grpc.web.MethodDescriptor(
  '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLatestBlock',
  grpc.web.MethodType.UNARY,
  proto.cash.z.wallet.sdk.rpc.ChainSpec,
  proto.cash.z.wallet.sdk.rpc.BlockID,
  /**
   * @param {!proto.cash.z.wallet.sdk.rpc.ChainSpec} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.cash.z.wallet.sdk.rpc.BlockID.deserializeBinary
);


/**
 * @const
 * @type {!grpc.web.AbstractClientBase.MethodInfo<
 *   !proto.cash.z.wallet.sdk.rpc.ChainSpec,
 *   !proto.cash.z.wallet.sdk.rpc.BlockID>}
 */
const methodInfo_CompactTxStreamer_GetLatestBlock = new grpc.web.AbstractClientBase.MethodInfo(
  proto.cash.z.wallet.sdk.rpc.BlockID,
  /**
   * @param {!proto.cash.z.wallet.sdk.rpc.ChainSpec} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.cash.z.wallet.sdk.rpc.BlockID.deserializeBinary
);


/**
 * @param {!proto.cash.z.wallet.sdk.rpc.ChainSpec} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @param {function(?grpc.web.Error, ?proto.cash.z.wallet.sdk.rpc.BlockID)}
 *     callback The callback function(error, response)
 * @return {!grpc.web.ClientReadableStream<!proto.cash.z.wallet.sdk.rpc.BlockID>|undefined}
 *     The XHR Node Readable Stream
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerClient.prototype.getLatestBlock =
    function(request, metadata, callback) {
  return this.client_.rpcCall(this.hostname_ +
      '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLatestBlock',
      request,
      metadata || {},
      methodDescriptor_CompactTxStreamer_GetLatestBlock,
      callback);
};


/**
 * @param {!proto.cash.z.wallet.sdk.rpc.ChainSpec} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @return {!Promise<!proto.cash.z.wallet.sdk.rpc.BlockID>}
 *     A native promise that resolves to the response
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerPromiseClient.prototype.getLatestBlock =
    function(request, metadata) {
  return this.client_.unaryCall(this.hostname_ +
      '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLatestBlock',
      request,
      metadata || {},
      methodDescriptor_CompactTxStreamer_GetLatestBlock);
};


/**
 * @const
 * @type {!grpc.web.MethodDescriptor<
 *   !proto.cash.z.wallet.sdk.rpc.BlockID,
 *   !proto.cash.z.wallet.sdk.rpc.CompactBlock>}
 */
const methodDescriptor_CompactTxStreamer_GetBlock = new grpc.web.MethodDescriptor(
  '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetBlock',
  grpc.web.MethodType.UNARY,
  proto.cash.z.wallet.sdk.rpc.BlockID,
  compact_formats_pb.CompactBlock,
  /**
   * @param {!proto.cash.z.wallet.sdk.rpc.BlockID} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  compact_formats_pb.CompactBlock.deserializeBinary
);


/**
 * @const
 * @type {!grpc.web.AbstractClientBase.MethodInfo<
 *   !proto.cash.z.wallet.sdk.rpc.BlockID,
 *   !proto.cash.z.wallet.sdk.rpc.CompactBlock>}
 */
const methodInfo_CompactTxStreamer_GetBlock = new grpc.web.AbstractClientBase.MethodInfo(
  compact_formats_pb.CompactBlock,
  /**
   * @param {!proto.cash.z.wallet.sdk.rpc.BlockID} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  compact_formats_pb.CompactBlock.deserializeBinary
);


/**
 * @param {!proto.cash.z.wallet.sdk.rpc.BlockID} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @param {function(?grpc.web.Error, ?proto.cash.z.wallet.sdk.rpc.CompactBlock)}
 *     callback The callback function(error, response)
 * @return {!grpc.web.ClientReadableStream<!proto.cash.z.wallet.sdk.rpc.CompactBlock>|undefined}
 *     The XHR Node Readable Stream
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerClient.prototype.getBlock =
    function(request, metadata, callback) {
  return this.client_.rpcCall(this.hostname_ +
      '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetBlock',
      request,
      metadata || {},
      methodDescriptor_CompactTxStreamer_GetBlock,
      callback);
};


/**
 * @param {!proto.cash.z.wallet.sdk.rpc.BlockID} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @return {!Promise<!proto.cash.z.wallet.sdk.rpc.CompactBlock>}
 *     A native promise that resolves to the response
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerPromiseClient.prototype.getBlock =
    function(request, metadata) {
  return this.client_.unaryCall(this.hostname_ +
      '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetBlock',
      request,
      metadata || {},
      methodDescriptor_CompactTxStreamer_GetBlock);
};


/**
 * @const
 * @type {!grpc.web.MethodDescriptor<
 *   !proto.cash.z.wallet.sdk.rpc.BlockRange,
 *   !proto.cash.z.wallet.sdk.rpc.CompactBlock>}
 */
const methodDescriptor_CompactTxStreamer_GetBlockRange = new grpc.web.MethodDescriptor(
  '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetBlockRange',
  grpc.web.MethodType.SERVER_STREAMING,
  proto.cash.z.wallet.sdk.rpc.BlockRange,
  compact_formats_pb.CompactBlock,
  /**
   * @param {!proto.cash.z.wallet.sdk.rpc.BlockRange} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  compact_formats_pb.CompactBlock.deserializeBinary
);


/**
 * @const
 * @type {!grpc.web.AbstractClientBase.MethodInfo<
 *   !proto.cash.z.wallet.sdk.rpc.BlockRange,
 *   !proto.cash.z.wallet.sdk.rpc.CompactBlock>}
 */
const methodInfo_CompactTxStreamer_GetBlockRange = new grpc.web.AbstractClientBase.MethodInfo(
  compact_formats_pb.CompactBlock,
  /**
   * @param {!proto.cash.z.wallet.sdk.rpc.BlockRange} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  compact_formats_pb.CompactBlock.deserializeBinary
);


/**
 * @param {!proto.cash.z.wallet.sdk.rpc.BlockRange} request The request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @return {!grpc.web.ClientReadableStream<!proto.cash.z.wallet.sdk.rpc.CompactBlock>}
 *     The XHR Node Readable Stream
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerClient.prototype.getBlockRange =
    function(request, metadata) {
  return this.client_.serverStreaming(this.hostname_ +
      '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetBlockRange',
      request,
      metadata || {},
      methodDescriptor_CompactTxStreamer_GetBlockRange);
};


/**
 * @param {!proto.cash.z.wallet.sdk.rpc.BlockRange} request The request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @return {!grpc.web.ClientReadableStream<!proto.cash.z.wallet.sdk.rpc.CompactBlock>}
 *     The XHR Node Readable Stream
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerPromiseClient.prototype.getBlockRange =
    function(request, metadata) {
  return this.client_.serverStreaming(this.hostname_ +
      '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetBlockRange',
      request,
      metadata || {},
      methodDescriptor_CompactTxStreamer_GetBlockRange);
};


/**
 * @const
 * @type {!grpc.web.MethodDescriptor<
 *   !proto.cash.z.wallet.sdk.rpc.TxFilter,
 *   !proto.cash.z.wallet.sdk.rpc.RawTransaction>}
 */
const methodDescriptor_CompactTxStreamer_GetTransaction = new grpc.web.MethodDescriptor(
  '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetTransaction',
  grpc.web.MethodType.UNARY,
  proto.cash.z.wallet.sdk.rpc.TxFilter,
  proto.cash.z.wallet.sdk.rpc.RawTransaction,
  /**
   * @param {!proto.cash.z.wallet.sdk.rpc.TxFilter} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.cash.z.wallet.sdk.rpc.RawTransaction.deserializeBinary
);


/**
 * @const
 * @type {!grpc.web.AbstractClientBase.MethodInfo<
 *   !proto.cash.z.wallet.sdk.rpc.TxFilter,
 *   !proto.cash.z.wallet.sdk.rpc.RawTransaction>}
 */
const methodInfo_CompactTxStreamer_GetTransaction = new grpc.web.AbstractClientBase.MethodInfo(
  proto.cash.z.wallet.sdk.rpc.RawTransaction,
  /**
   * @param {!proto.cash.z.wallet.sdk.rpc.TxFilter} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.cash.z.wallet.sdk.rpc.RawTransaction.deserializeBinary
);


/**
 * @param {!proto.cash.z.wallet.sdk.rpc.TxFilter} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @param {function(?grpc.web.Error, ?proto.cash.z.wallet.sdk.rpc.RawTransaction)}
 *     callback The callback function(error, response)
 * @return {!grpc.web.ClientReadableStream<!proto.cash.z.wallet.sdk.rpc.RawTransaction>|undefined}
 *     The XHR Node Readable Stream
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerClient.prototype.getTransaction =
    function(request, metadata, callback) {
  return this.client_.rpcCall(this.hostname_ +
      '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetTransaction',
      request,
      metadata || {},
      methodDescriptor_CompactTxStreamer_GetTransaction,
      callback);
};


/**
 * @param {!proto.cash.z.wallet.sdk.rpc.TxFilter} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @return {!Promise<!proto.cash.z.wallet.sdk.rpc.RawTransaction>}
 *     A native promise that resolves to the response
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerPromiseClient.prototype.getTransaction =
    function(request, metadata) {
  return this.client_.unaryCall(this.hostname_ +
      '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetTransaction',
      request,
      metadata || {},
      methodDescriptor_CompactTxStreamer_GetTransaction);
};


/**
 * @const
 * @type {!grpc.web.MethodDescriptor<
 *   !proto.cash.z.wallet.sdk.rpc.RawTransaction,
 *   !proto.cash.z.wallet.sdk.rpc.SendResponse>}
 */
const methodDescriptor_CompactTxStreamer_SendTransaction = new grpc.web.MethodDescriptor(
  '/cash.z.wallet.sdk.rpc.CompactTxStreamer/SendTransaction',
  grpc.web.MethodType.UNARY,
  proto.cash.z.wallet.sdk.rpc.RawTransaction,
  proto.cash.z.wallet.sdk.rpc.SendResponse,
  /**
   * @param {!proto.cash.z.wallet.sdk.rpc.RawTransaction} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.cash.z.wallet.sdk.rpc.SendResponse.deserializeBinary
);


/**
 * @const
 * @type {!grpc.web.AbstractClientBase.MethodInfo<
 *   !proto.cash.z.wallet.sdk.rpc.RawTransaction,
 *   !proto.cash.z.wallet.sdk.rpc.SendResponse>}
 */
const methodInfo_CompactTxStreamer_SendTransaction = new grpc.web.AbstractClientBase.MethodInfo(
  proto.cash.z.wallet.sdk.rpc.SendResponse,
  /**
   * @param {!proto.cash.z.wallet.sdk.rpc.RawTransaction} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.cash.z.wallet.sdk.rpc.SendResponse.deserializeBinary
);


/**
 * @param {!proto.cash.z.wallet.sdk.rpc.RawTransaction} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @param {function(?grpc.web.Error, ?proto.cash.z.wallet.sdk.rpc.SendResponse)}
 *     callback The callback function(error, response)
 * @return {!grpc.web.ClientReadableStream<!proto.cash.z.wallet.sdk.rpc.SendResponse>|undefined}
 *     The XHR Node Readable Stream
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerClient.prototype.sendTransaction =
    function(request, metadata, callback) {
  return this.client_.rpcCall(this.hostname_ +
      '/cash.z.wallet.sdk.rpc.CompactTxStreamer/SendTransaction',
      request,
      metadata || {},
      methodDescriptor_CompactTxStreamer_SendTransaction,
      callback);
};


/**
 * @param {!proto.cash.z.wallet.sdk.rpc.RawTransaction} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @return {!Promise<!proto.cash.z.wallet.sdk.rpc.SendResponse>}
 *     A native promise that resolves to the response
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerPromiseClient.prototype.sendTransaction =
    function(request, metadata) {
  return this.client_.unaryCall(this.hostname_ +
      '/cash.z.wallet.sdk.rpc.CompactTxStreamer/SendTransaction',
      request,
      metadata || {},
      methodDescriptor_CompactTxStreamer_SendTransaction);
};


/**
 * @const
 * @type {!grpc.web.MethodDescriptor<
 *   !proto.cash.z.wallet.sdk.rpc.TransparentAddressBlockFilter,
 *   !proto.cash.z.wallet.sdk.rpc.RawTransaction>}
 */
const methodDescriptor_CompactTxStreamer_GetAddressTxids = new grpc.web.MethodDescriptor(
  '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetAddressTxids',
  grpc.web.MethodType.SERVER_STREAMING,
  proto.cash.z.wallet.sdk.rpc.TransparentAddressBlockFilter,
  proto.cash.z.wallet.sdk.rpc.RawTransaction,
  /**
   * @param {!proto.cash.z.wallet.sdk.rpc.TransparentAddressBlockFilter} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.cash.z.wallet.sdk.rpc.RawTransaction.deserializeBinary
);


/**
 * @const
 * @type {!grpc.web.AbstractClientBase.MethodInfo<
 *   !proto.cash.z.wallet.sdk.rpc.TransparentAddressBlockFilter,
 *   !proto.cash.z.wallet.sdk.rpc.RawTransaction>}
 */
const methodInfo_CompactTxStreamer_GetAddressTxids = new grpc.web.AbstractClientBase.MethodInfo(
  proto.cash.z.wallet.sdk.rpc.RawTransaction,
  /**
   * @param {!proto.cash.z.wallet.sdk.rpc.TransparentAddressBlockFilter} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.cash.z.wallet.sdk.rpc.RawTransaction.deserializeBinary
);


/**
 * @param {!proto.cash.z.wallet.sdk.rpc.TransparentAddressBlockFilter} request The request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @return {!grpc.web.ClientReadableStream<!proto.cash.z.wallet.sdk.rpc.RawTransaction>}
 *     The XHR Node Readable Stream
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerClient.prototype.getAddressTxids =
    function(request, metadata) {
  return this.client_.serverStreaming(this.hostname_ +
      '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetAddressTxids',
      request,
      metadata || {},
      methodDescriptor_CompactTxStreamer_GetAddressTxids);
};


/**
 * @param {!proto.cash.z.wallet.sdk.rpc.TransparentAddressBlockFilter} request The request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @return {!grpc.web.ClientReadableStream<!proto.cash.z.wallet.sdk.rpc.RawTransaction>}
 *     The XHR Node Readable Stream
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerPromiseClient.prototype.getAddressTxids =
    function(request, metadata) {
  return this.client_.serverStreaming(this.hostname_ +
      '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetAddressTxids',
      request,
      metadata || {},
      methodDescriptor_CompactTxStreamer_GetAddressTxids);
};


/**
 * @const
 * @type {!grpc.web.MethodDescriptor<
 *   !proto.cash.z.wallet.sdk.rpc.Empty,
 *   !proto.cash.z.wallet.sdk.rpc.LightdInfo>}
 */
const methodDescriptor_CompactTxStreamer_GetLightdInfo = new grpc.web.MethodDescriptor(
  '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLightdInfo',
  grpc.web.MethodType.UNARY,
  proto.cash.z.wallet.sdk.rpc.Empty,
  proto.cash.z.wallet.sdk.rpc.LightdInfo,
  /**
   * @param {!proto.cash.z.wallet.sdk.rpc.Empty} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.cash.z.wallet.sdk.rpc.LightdInfo.deserializeBinary
);


/**
 * @const
 * @type {!grpc.web.AbstractClientBase.MethodInfo<
 *   !proto.cash.z.wallet.sdk.rpc.Empty,
 *   !proto.cash.z.wallet.sdk.rpc.LightdInfo>}
 */
const methodInfo_CompactTxStreamer_GetLightdInfo = new grpc.web.AbstractClientBase.MethodInfo(
  proto.cash.z.wallet.sdk.rpc.LightdInfo,
  /**
   * @param {!proto.cash.z.wallet.sdk.rpc.Empty} request
   * @return {!Uint8Array}
   */
  function(request) {
    return request.serializeBinary();
  },
  proto.cash.z.wallet.sdk.rpc.LightdInfo.deserializeBinary
);


/**
 * @param {!proto.cash.z.wallet.sdk.rpc.Empty} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @param {function(?grpc.web.Error, ?proto.cash.z.wallet.sdk.rpc.LightdInfo)}
 *     callback The callback function(error, response)
 * @return {!grpc.web.ClientReadableStream<!proto.cash.z.wallet.sdk.rpc.LightdInfo>|undefined}
 *     The XHR Node Readable Stream
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerClient.prototype.getLightdInfo =
    function(request, metadata, callback) {
  return this.client_.rpcCall(this.hostname_ +
      '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLightdInfo',
      request,
      metadata || {},
      methodDescriptor_CompactTxStreamer_GetLightdInfo,
      callback);
};


/**
 * @param {!proto.cash.z.wallet.sdk.rpc.Empty} request The
 *     request proto
 * @param {?Object<string, string>} metadata User defined
 *     call metadata
 * @return {!Promise<!proto.cash.z.wallet.sdk.rpc.LightdInfo>}
 *     A native promise that resolves to the response
 */
proto.cash.z.wallet.sdk.rpc.CompactTxStreamerPromiseClient.prototype.getLightdInfo =
    function(request, metadata) {
  return this.client_.unaryCall(this.hostname_ +
      '/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLightdInfo',
      request,
      metadata || {},
      methodDescriptor_CompactTxStreamer_GetLightdInfo);
};


module.exports = proto.cash.z.wallet.sdk.rpc;

