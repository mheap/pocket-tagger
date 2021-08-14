const sinon = require("sinon");
const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
const expect = chai.expect;

const Credentials = require("local-credentials");
const Pocket = require("pocket-promise");
const UrlTagger = require("url-tagger");
const PocketTagger = require("../src/index");

function getTagger() {
  return PocketTagger(
    "default",
    {
      // Code related
      php: "php",
      javascript: "(nodejs|javascript)",

      // Operations
      terraform: "terraform",
      consul: "consul",

      // Brands
      "hacker-news": "news.ycombinator"
    },
    {
      url: {
        "hacker-news": ["hacker-news"]
      },
      content: {
        hashicorp: ["terraform", "consul"],
        dev: ["php", "javascript"],
        php: ["php"],
        javascript: ["javascript"]
      }
    }
  );
}

describe("init()", function() {
  beforeEach(async function() {
    this.sandbox = sinon.sandbox.create();
  });

  afterEach(function() {
    this.sandbox.restore();
  });

  it.skip("loads credentials from the correct place", async function() {
    // @TODO: Find a way to assert based on constructor parameters
    // Credential Loading
    this.sandbox.mock(Credentials.prototype, "get").returns({
      consumer_key: "consumer",
      access_token: "access"
    });

    // Test!
    const tagger = await PocketTagger();
    expect(tagger.pocket).to.be.a(Pocket);
  });

  it("creates an instance of Pocket using the correct parameters", async function() {
    this.sandbox.stub(Credentials.prototype, "get").returns({
      consumer_key: "consumer",
      access_token: "access"
    });

    const tagger = await PocketTagger("default", {}, { url: {}, content: {} });
    expect(tagger.pocket).to.be.an.instanceof(Pocket);

    // @TODO: Find a way to assert based on constructor parameters to remove details
    // of Pocket internals here
    expect(tagger.pocket.config.consumer_key).to.eql("consumer");
    expect(tagger.pocket.config.access_token).to.eql("access");
  });

  it("creates an instance of UrlTagger with the correct parameters", async function() {
    this.sandbox.stub(Credentials.prototype, "get").returns({
      consumer_key: "consumer",
      access_token: "access"
    });

    const regexes = {
      terraform: "terraform",
      consul: "consul"
    };

    const rules = {
      url: {
        terraform: ["terraform"],
        consul: ["consul"]
      },
      content: {
        hashicorp: ["terraform", "consul"]
      },
      html: {
        "non-hashicorp": [["!terraform", "!consul"]]
      }
    };

    const tagger = await PocketTagger("default", regexes, rules);

    expect(tagger.urlTagger).to.be.an.instanceof(UrlTagger);

    // @TODO: Find a way to assert based on constructor parameters to remove details
    // of UrlTagger internals here
    expect(tagger.urlTagger.urlRules.regexes).to.eql(regexes);
    expect(tagger.urlTagger.urlRules.rules).to.eql(rules.url);
    expect(tagger.urlTagger.contentRules.regexes).to.eql(regexes);
    expect(tagger.urlTagger.contentRules.rules).to.eql(rules.content);
    expect(tagger.urlTagger.htmlRules.regexes).to.eql(regexes);
    expect(tagger.urlTagger.htmlRules.rules).to.eql(rules.html);
  });
});

describe("PocketTagger", function() {
  beforeEach(async function() {
    this.sandbox = sinon.sandbox.create();

    this.sandbox.stub(Credentials.prototype, "get").returns({
      consumer_key: "consumer",
      access_token: "access"
    });

    this.tagger = await getTagger();
  });

  afterEach(function() {
    this.sandbox.restore();
  });

  describe("#fetchArticles", async function() {
    it("requests 9999 articles by default", async function() {
      const mock = this.sandbox.mock(Pocket.prototype, "get");
      mock
        .expects("get")
        .once()
        .withExactArgs({ count: 9999 })
        .returns({ list: [] });
      await this.tagger.fetchArticles();
      mock.verify();
    });

    it("passes through the requested number of articles", async function() {
      const mock = this.sandbox.mock(Pocket.prototype, "get");
      mock
        .expects("get")
        .once()
        .withExactArgs({ count: 10 })
        .returns({ list: [] });
      await this.tagger.fetchArticles(10);
      mock.verify();
    });

    it("reformats the incoming data in to the correct format", async function() {
      const stub = this.sandbox.stub(Pocket.prototype, "get");
      stub.returns({
        list: {
          itemIdOne: { resolved_url: "http://example.com" },
          itemIdTwo: { resolved_url: "https://sub.example.com" }
        }
      });

      expect(await this.tagger.fetchArticles()).to.eql({
        itemIdOne: "http://example.com",
        itemIdTwo: "https://sub.example.com"
      });
    });
  });

  describe("#fetchTags", async function() {
    it("handles no articles being passed", async function() {
      const mock = this.sandbox.mock(UrlTagger.prototype, "run");
      mock.expects("run").never();
      await this.tagger.fetchTags({});
      mock.verify();
    });

    it("calls urlTagger once per article", async function() {
      const mock = this.sandbox.mock(UrlTagger.prototype, "run");
      mock
        .expects("run")
        .once()
        .withExactArgs("http://example.com")
        .returns(["apple"]);
      mock
        .expects("run")
        .once()
        .withExactArgs("https://sub.example.com")
        .returns(["orange"]);

      const articles = {
        itemIdOne: "http://example.com",
        itemIdTwo: "https://sub.example.com"
      };

      expect(await this.tagger.fetchTags(articles)).to.eql({
        itemIdOne: ["apple"],
        itemIdTwo: ["orange"]
      });

      mock.verify();
    });

    // Broken after the allSettled refactor. @TODO: Fix this
    xit("ignores any errors and processes the other items", async function() {
      const mock = this.sandbox.mock(UrlTagger.prototype, "run");
      mock
        .expects("run")
        .once()
        .withExactArgs("http://example.com")
        .throws(Error);
      mock
        .expects("run")
        .once()
        .withExactArgs("https://sub.example.com")
        .returns(["orange"]);

      const articles = {
        itemIdOne: "http://example.com",
        itemIdTwo: "https://sub.example.com"
      };

      console.log(await this.tagger.fetchTags(articles));
      expect(await this.tagger.fetchTags(articles)).to.eql({
        itemIdTwo: ["orange"]
      });

      mock.verify();
    });
  });

  describe("#persistTags", async function() {
    it("handles no tags being passed", async function() {
      const mock = this.sandbox.mock(Pocket.prototype, "send");
      mock.expects("send").never();
      await this.tagger.persistTags({}, {});
      mock.verify();
    });

    it("clears tags when there are none set", async function() {
      const mock = this.sandbox.mock(Pocket.prototype, "send");
      mock
        .expects("send")
        .once()
        .withExactArgs({
          actions: [
            {
              action: "tags_clear",
              item_id: "itemIdOne"
            }
          ]
        });

      await this.tagger.persistTags(
        {},
        {
          itemIdOne: []
        }
      );
      mock.verify();
    });

    it("replaces existing tags (single)", async function() {
      const mock = this.sandbox.mock(Pocket.prototype, "send");
      mock
        .expects("send")
        .once()
        .withExactArgs({
          actions: [
            {
              action: "tags_replace",
              item_id: "itemIdOne",
              tags: "apple"
            }
          ]
        });

      await this.tagger.persistTags(
        {},
        {
          itemIdOne: ["apple"]
        }
      );
      mock.verify();
    });

    it("replaces existing tags (multiple)", async function() {
      const mock = this.sandbox.mock(Pocket.prototype, "send");
      mock
        .expects("send")
        .once()
        .withExactArgs({
          actions: [
            {
              action: "tags_replace",
              item_id: "itemIdOne",
              tags: "apple,banana"
            }
          ]
        });

      await this.tagger.persistTags(
        {},
        {
          itemIdOne: ["apple", "banana"]
        }
      );
      mock.verify();
    });

    it("returns statistics about the tagging", async function() {
      this.sandbox.stub(Pocket.prototype, "send");
      expect(
        await this.tagger.persistTags({}, { itemIdOne: ["apple", "banana"] })
      ).to.eql({
        tags: 2,
        urls: 1
      });
    });

    it("passes multiple tag actions at once", async function() {
      const mock = this.sandbox.mock(Pocket.prototype, "send");
      mock
        .expects("send")
        .once()
        .withExactArgs({
          actions: [
            {
              action: "tags_replace",
              item_id: "itemIdOne",
              tags: "apple,banana"
            },
            {
              action: "tags_replace",
              item_id: "itemIdTwo",
              tags: "mango"
            },
            {
              action: "tags_clear",
              item_id: "itemIdThree"
            }
          ]
        });

      await this.tagger.persistTags(
        {},
        {
          itemIdOne: ["apple", "banana"],
          itemIdTwo: ["mango"],
          itemIdThree: []
        }
      );
      mock.verify();
    });
  });

  describe("#run", async function() {
    it("chains everything together correctly", async function() {
      const mock = sinon.mock(this.tagger);
      mock
        .expects("fetchArticles")
        .once()
        .returns({ itemIdOne: "http://example.com" });
      mock
        .expects("fetchTags")
        .once()
        .withExactArgs({ itemIdOne: "http://example.com" })
        .returns({ itemIdOne: ["apples", "bananas"] });
      mock
        .expects("persistTags")
        .once()
        .withExactArgs(
          { itemIdOne: "http://example.com" },
          { itemIdOne: ["apples", "bananas"] }
        )
        .returns({});

      await this.tagger.run();
    });
  });
});
