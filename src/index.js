const UrlTagger = require("url-tagger");
const Pocket = require("pocket-promise");
const Credentials = require("local-credentials");
const debug = require("debug")("pocket-tagger");

let init = function(account, regex, rules, cache) {
  return new Promise(async function(resolve, reject) {
    const credentials = await new Credentials("~/.pocket/credentials").get(
      account
    );

    const pocket = new Pocket({
      consumer_key: credentials.consumer_key,
      access_token: credentials.access_token
    });

    const urlTagger = new UrlTagger(regex, rules, cache);

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
    debug("Processing: " + articles[itemId]);
    jobs[itemId] = this.urlTagger.run(articles[itemId]);
  }

  debug("Waiting for all pages to be fetched + analysed");
  await Promise.allSettled(Object.values(jobs));
  return jobs;
};

PocketTagger.prototype.persistTags = async function(articles, tags) {
  debug("Persisting tags");
  // Loop through and use urlTagger on each
  let stats = {
    urls: 0,
    tags: 0
  };

  // For each set of tags, make a `modify` call to *replace*
  // the exising tags
  let tagActions = [];
  for (let itemId in tags) {
    try {
      // We still have to await here even though we used allSettled above
      // as there's no pass by reference and we need to unwrap the promise
      const t = await tags[itemId];
      stats.urls++;
      stats.tags += t.length;

      let tagStr = t.join(",");
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
    } catch (e) {
      debug("Error fetching URL '" + articles[itemId] + "'");
      tagActions.push({
        action: "tags_replace",
        item_id: itemId,
        tags: "error-fetching"
      });
    }
  }

  if (tagActions.length) {
    debug("Sending tag updates");
    await this.pocket.send({
      actions: tagActions
    });
  }

  return stats;
};

PocketTagger.prototype.run = async function(articleCount) {
  let articles = await this.fetchArticles(articleCount);
  let tags = await this.fetchTags(articles);
  let stats = await this.persistTags(articles, tags);
};

module.exports = init;
