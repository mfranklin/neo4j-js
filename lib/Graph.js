/* ========================================================================================================
 * 
 * Graph Class
 * 
 * ===================================================================================================== */

module.exports = Graph;

function Graph (neo4j)
{
	/* ========================================================================================================
	 * 
	 * Private Members Declaration (no methods)
	 * 
	 * ===================================================================================================== */

	var _createIndexFormat = [ { name: 'batch', optional: true, instance: neo4j.Api.Batch },
							   { name: 'name', type: 'string' },
							   { name: 'config', type: 'object', optional: true },
							   { name: 'callback', type: 'function' } ];
	
	var _dataArgsFormat = [ { name: 'batch', optional: true, instance: neo4j.Api.Batch }, 
							'data', 
							{ name: 'callback', type: 'function' } ];
	
	var _idArgsFormat = [ { name: 'batch', optional: true, instance: neo4j.Api.Batch },
							'id',
							{ name: 'callback', type: 'function' } ];
	
	var _queryArgsFormat = [ { name: 'batch', optional: true, instance: neo4j.Api.Batch }, 
							 { name: 'profile', type: 'boolean', optional: true }, 
							 { name: 'query', type: 'string' }, 
							 { name: 'params', type: 'object', optional: true }, 
							 { name: 'callback', type: 'function' } ];
	var _this = this;

	/* ========================================================================================================
	 * 
	 * Public Members Declaration (no methods)
	 * 
	 * ===================================================================================================== */
	
	this.reconnect = neo4j.Api.reconnect;

	/* ========================================================================================================
	 * 
	 * General Graph Methods
	 * 
	 * ===================================================================================================== */
	
	this.createBatch = function () { return new neo4j.Api.Batch(); };
	
	this.query = function (/* batch, profile, */ query, /* params, */ callback)
	{
		var args = neo4j.Utils.parseArgs(arguments, _queryArgsFormat);
		var body = { query: args.query, params: (args.params ? args.params : {}) };
		
		var endpoint = args.profile ? neo4j.Api.getEndpoint('cypher', '?profile=true') : 'cypher';
		
		new neo4j.Api.Request(args.batch, endpoint, 'POST', body, function (error, obj)
		{
			if (error)
			{
				args.callback(error);
				return;
			}
			
			//parse result set
			var c;
			var row;
			var results = [];
			var constructors = [];
			for (var r = 0; r < obj.data.length; r++)
			{
				results.push({});
				row = obj.data[r];
				
				for (c = 0; c < obj.columns.length; c++)
				{
					if (r == 0) // on the first iteration, try to determine the data type of each column
					{
						if (row[c] && typeof row[c] === 'object')
						{
							if (typeof row[c].self === 'string' && typeof row[c].data === 'object')
							{
								// a relationship or node
								constructors.push(typeof row[c].start === 'string' ? neo4j.Relationship : neo4j.Node);
							}
							else if (typeof row[c].start === 'string' && typeof row[c].end === 'string' && typeof row[c].nodes === 'object')
							{
								//a path
								constructors.push(neo4j.Path);
							}
							else
							{
								constructors.push(null);
							}
						}
						else
						{
							constructors.push(null);
						}
					}
					
					results[r][obj.columns[c]] = constructors[c] ? new constructors[c](row[c]) : row[c];
				}
				
				if (obj.plan)
					results.plan = obj.plan;
			}
			
			args.callback(null, results);
		});
	};
	
	/* ========================================================================================================
	 * 
	 * Index Methods
	 * 
	 * ===================================================================================================== */

	this.createNodeIndex = function (/* batch, */ name, /* config, */ callback)
	{
		var args = neo4j.Utils.parseArgs(arguments, _createIndexFormat);
		createIndex('node_index', args.batch, args.name, args.config, args.callback);
	};

	this.createRelationshipIndex = function (/* batch, */ name, /* config, */ callback)
	{
		var args = neo4j.Utils.parseArgs(arguments, _createIndexFormat);
		createIndex('relationship_index', args.batch, args.name, args.config, args.callback);
	};
	
	function createIndex (type, batch, name, config, callback)
	{
		var body = { name: name };
		if (config)
			body.config = config;
		
		neo4j.Utils.autoBatch(batch, type, 'POST', body, neo4j.Utils.errorOnly(callback));
	}
	
	this.deleteNodeIndex = function (/* batch, */ name, callback)
	{
		var args = neo4j.Utils.parseArgs(arguments, _createIndexFormat);
		deleteIndex('node_index', args.batch, args.name, args.callback);
	};
	
	this.deleteRelationshipIndex = function (/* batch, */ name, callback)
	{
		var args = neo4j.Utils.parseArgs(arguments, _createIndexFormat);
		deleteIndex('relationship_index', args.batch, args.name, args.callback);
	};
	
	function deleteIndex (type, batch, name, callback)
	{
		new neo4j.Api.Request(batch, neo4j.Api.getEndpoint(type, name), 'DELETE', null, neo4j.Utils.errorOnly(callback));
	}
	
	this.listNodeIndexes = function (/* batch, */ callback)
	{
		listIndexes('node_index', arguments);
	};
	
	this.listRelationshipIndexes = function (/* batch, */ callback)
	{
		listIndexes('relationship_index', arguments);
	};
	
	function listIndexes (type, args)
	{
		var batch = null;
		var callback = args[0];
		if (args.length > 1)
		{
			batch = callback;
			callback = args[1];
		}
		
		new neo4j.Api.Request(batch, type, 'GET', null, function (error, indexes)
		{
			if (!indexes && !error)
				indexes = {};
			
			callback(error, indexes);
		});
	}
 	
	/* ========================================================================================================
	 * 
	 * Node Methods
	 * 
	 * ===================================================================================================== */
	
	this.createNode = function (/* batch, */ data, callback)
	{
		var args = neo4j.Utils.parseArgs(arguments, _dataArgsFormat);
		neo4j.Utils.autoBatch(args.batch, 'node', 'POST', args.data, neo4j.Node.nodeCallback(args.callback));
	};
	
	this.deleteNode = function (/* batch, */ id, callback)
	{
		var args = neo4j.Utils.parseArgs(arguments, _idArgsFormat);
		
		if (args.id instanceof Array)
		{
			for (var i in args.id)
			{
				if (args.id[i] instanceof neo4j.Node)
				{
					args.id = args.id.map(function (e) { return e instanceof neo4j.Node ? e.id : e});
					break;
				}
			}
		}
		else if (args.id instanceof neo4j.Node)
		{
			args.id = args.id.id;
		}
		
		neo4j.Utils.autoBatch(args.batch, neo4j.Api.getEndpoint.bind(null, 'node'), args.id, 'DELETE', null, neo4j.Utils.errorOnly(args.callback));
	};
	
	this.getNode = function (/* batch, */ id, callback)
	{
		var args = neo4j.Utils.parseArgs(arguments, _idArgsFormat);
		neo4j.Utils.autoBatch(args.batch, neo4j.Api.getEndpoint.bind(null, 'node'), args.id, 'GET', null, neo4j.Node.nodeCallback(args.callback));
	};
	
	this.isNode = function (node) { return node instanceof neo4j.Node; };

	/* ========================================================================================================
	 * 
	 * Path Methods
	 * 
	 * ===================================================================================================== */
	
	this.isPath = function (path) { return path instanceof neo4j.Path; };

	/* ========================================================================================================
	 * 
	 * Relationship Methods
	 * 
	 * ===================================================================================================== */
	
	this.deleteRelationship = function (/* batch, */ id, callback)
	{
		var args = neo4j.Utils.parseArgs(arguments, _idArgsFormat);
		
		if (args.id instanceof Array)
		{
			for (var i in args.id)
			{
				if (args.id[i] instanceof neo4j.Relationship)
				{
					args.id = args.id.map(function (e) { return e instanceof neo4j.Relationship ? e.id : e});
					break;
				}
			}
		}
		else if (args.id instanceof neo4j.Relationship)
		{
			args.id = args.id.id;
		}
		
		neo4j.Utils.autoBatch(args.batch, neo4j.Api.getEndpoint.bind(null, 'relationship'), args.id, 'DELETE', null, neo4j.Utils.errorOnly(args.callback));
	};
	
	this.getRelationship = function (/* batch, */ id, callback)
	{
		var args = neo4j.Utils.parseArgs(arguments, _idArgsFormat);
		neo4j.Utils.autoBatch(args.batch, neo4j.Api.getEndpoint.bind(null, 'relationship'), args.id, 'GET', null, neo4j.Relationship.relationshipCallback(args.callback));
	};
	
	this.isRelationship = function (rel) { return rel instanceof neo4j.Relationship; };
}
