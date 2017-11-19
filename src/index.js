const UrlTagger = require("url-tagger");
const Pocket = require("pocket-promise");
const Credentials = require("local-credentials");

let init = function(account, regex, rules) {
  return new Promise(async function(resolve, reject) {
    const credentials = await new Credentials("~/.pocket/credentials").get(
      account
    );

    const pocket = new Pocket({
      consumer_key: credentials.consumer_key,
      access_token: credentials.access_token
    });

    const urlTagger = new UrlTagger(regex, rules);

    let pt = new PocketTagger(pocket, urlTagger);
    return resolve(pt);
  });
};

let PocketTagger = function(pocket, urlTagger) {
  this.pocket = pocket;
  this.urlTagger = urlTagger;
};

PocketTagger.prototype.fetchArticles = async function(count) {
  count = count || 9999;

  let articles = (await this.pocket.get({ count: count })).list;

  let reformatted = {};
  for (var itemId in articles) {
    reformatted[itemId] = articles[itemId].resolved_url;
  }
  return reformatted;
};

PocketTagger.prototype.fetchTags = async function(articles) {
  let jobs = {};
  for (let itemId in articles) {
    try {
      // It'd be faster to wait for all of these promises to resolve at once,
      // but then if one errors execution stops. Doing them one at a time means
      // that we only drop the one that fails
      jobs[itemId] = await this.urlTagger.run(articles[itemId]);
    } catch (e) {
      // Silently skip any fetch errors
    }
  }
  return jobs;
};

PocketTagger.prototype.persistTags = async function(tags) {
  // Loop through and use urlTagger on each
  let stats = {
    urls: 0,
    tags: 0
  };

  // For each set of tags, make a `modify` call to *replace*
  // the exising tags
  let tagActions = [];
  for (let itemId in tags) {
    stats.urls++;
    stats.tags += tags[itemId].length;

    let tagStr = tags[itemId].join(",");
    if (tagStr.length === 0) {
      tagActions.push({
        action: "tags_clear",
        item_id: itemId
      });
    } else {
      tagActions.push({
        action: "tags_replace",
        item_id: itemId,
        tags: tagStr
      });
    }
  }

  if (tagActions.length) {
    await this.pocket.send({
      actions: tagActions
    });
  }

  return stats;
};

PocketTagger.prototype.run = async function(articleCount) {
  let articles = await this.fetchArticles(articleCount);
  let tags = await this.fetchTags(articles);
  let stats = await this.persistTags(tags);
};

module.exports = init;
