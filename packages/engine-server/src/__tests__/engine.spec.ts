import {
  DEngine,
  DNodeUtils,
  INoteOpts,
  Note,
  Schema,
  SchemaUtils,
  testUtils as testUtilsCommonAll,
} from "@dendronhq/common-all";
import {
  EngineTestUtils,
  FileTestUtils,
  LernaTestUtils,
  node2MdFile,
} from "@dendronhq/common-server";
import fs from "fs-extra";
import _ from "lodash";
import path from "path";
import { DendronEngine } from "../engine";

function expectNoteProps(
  expect: jest.Expect,
  note: Note,
  expectedProps: INoteOpts
) {
  const propsToCheck = ["fname"].concat(_.keys(expectedProps));
  expect(_.pick(note, propsToCheck)).toEqual(expectedProps);
}

function stripEntropicData(ent: any) {
  return _.omit(ent, ["created", "updated"]);
}

describe("engine:exact", () => {
  let root: string;
  const queryMode = "note";
  let actualFiles: string[];
  let expectedFiles: string[];
  let engine: DEngine;

  describe("schema", () => {
    describe("basic", () => {
      beforeEach(() => {
        root = EngineTestUtils.setupStoreDir();
        engine = DendronEngine.getOrCreateEngine({
          root,
          forceNew: true,
          mode: "exact",
        });
      });

      afterEach(() => {
        expect(actualFiles).toEqual(expectedFiles);
        fs.removeSync(root);
      });

      test("init", async () => {
        await engine.init();
        const schemas = _.values(engine.schemas);
        testUtilsCommonAll.expectSnapshot(expect, "main", schemas);
        expect(schemas.length).toEqual(4);
        const note = engine.notes["foo"];
        const schema = engine.schemas["foo"];
        const barSchema = engine.schemas["bar"];
        const schemaMatch = SchemaUtils.matchNote(note, engine.schemas);
        expect(schemaMatch.toRawProps()).toEqual(schema.toRawProps());
        const schemaNamespace = engine.schemas["bar"];
        expect(schemaNamespace.namespace).toBeTruthy();

        // check that children with same id are still unique
        const fooOneChild = _.find(schema.children, { id: "one" }) as Schema;
        expect(fooOneChild.fname).toEqual("foo.schema");
        const barOneChild = _.find(barSchema.children, { id: "one" }) as Schema;
        expect(barOneChild.fname).toEqual("bar.schema");
        expect(
          testUtilsCommonAll.omitEntropicProps(fooOneChild.toRawProps(), true)
        ).toMatchSnapshot("bond");

        // // case3
        // schema = engine.schemas["test1"];
        // expect(schema.children[0].id).toEqual("test1-1-1");
      });

      test("add node with schema", async () => {
        await engine.init();
        await engine.write(
          new Note({ id: "bar.ns.one.alpha", fname: "bar.ns.one.alpha" }),
          { newNode: true, parentsAsStubs: true }
        );
        const note = engine.notes["bar.ns.one.alpha"];
        const schemaDomain = engine.schemas["bar"];

        const schema = _.find(schemaDomain.nodes, { id: "alpha" }) as Schema;
        const schemaMatch = SchemaUtils.matchNote(note, engine.schemas);
        expect(schemaMatch).toEqual(schema);
      });

      test("write schema", async () => {
        await engine.init();
        const schema = new Schema({ fname: "bond" });
        await engine.write(schema, {
          newNode: true,
          parentsAsStubs: true,
        });
        const schemaInEngine = engine.schemas["bond"];
        testUtilsCommonAll.expectSnapshot(expect, "schema", schemaInEngine);
        expect(
          fs.readFileSync(path.join(root, "bond.schema.yml"), "utf8")
        ).toMatchSnapshot("bond.schema");
        expect(
          _.pick(schemaInEngine.toRawProps(), [
            "id",
            "title",
            "fname",
            "parent",
            "children",
          ])
        ).toEqual({
          id: "bond",
          title: "bond",
          fname: "bond.schema",
          parent: "root",
          children: [],
        });
      });

      test("delete schema", async () => {
        await engine.init();
        const numNodesPre = _.values(engine.schemas).length;
        const fooNode = await engine.queryOne("foo", "schema");
        await engine.delete(fooNode.data.id, "schema");
        expect(_.values(engine.schemas).length).toEqual(numNodesPre - 1);
        // TODO: check for files
        [expectedFiles, actualFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore(),
          {
            remove: ["foo.schema.yml"],
          }
        );
      });
    });

    describe("import", () => {
      beforeEach(() => {
        root = EngineTestUtils.setupStoreDir({
          storeDirSrc: "engine-server.parser",
        });
        engine = DendronEngine.getOrCreateEngine({
          root,
          forceNew: true,
          mode: "exact",
        });
      });

      afterEach(() => {
        expect(actualFiles).toEqual(expectedFiles);
        fs.removeSync(root);
      });

      test("basic", async () => {
        await engine.init();
        await engine.write(new Note({ id: "foo.bar.id", fname: "foo.bar" }), {
          newNode: true,
          parentsAsStubs: true,
        });
        // expect(_.map(engine.schemas, s => s.toRawPropsRecursive())).toMatchSnapshot("bond");
        const note = engine.notes["foo.bar.id"];
        const schemaDomain = engine.schemas["foo"];
        const schemaMatch = SchemaUtils.matchNote(note, engine.schemas);
        const schema = _.find(schemaDomain.nodes, { id: "bar.bar" }) as Schema;
        expect(schemaMatch).toEqual(schema);
      });

      test("double import", async () => {
        await engine.init();
        await engine.write(
          new Note({ id: "foo.baz.bar.id", fname: "foo.baz.bar" }),
          { newNode: true, parentsAsStubs: true }
        );
        const note = engine.notes["foo.baz.bar.id"];
        const schemaDomain = engine.schemas["foo"];
        const schemaMatch = SchemaUtils.matchNote(note, engine.schemas);
        const schema = _.find(schemaDomain.nodes, {
          id: "baz.bar.bar",
        }) as Schema;
        expect(schemaMatch).toEqual(schema);
      });

      test("import and namespace", async () => {
        await engine.init();
        await engine.write(
          new Note({ id: "foo.baz.ns.one.id", fname: "foo.baz.ns.one" }),
          { newNode: true, parentsAsStubs: true }
        );
        const note = engine.notes["foo.baz.ns.one.id"];
        const schemaDomain = engine.schemas["foo"];
        const schemaMatch = SchemaUtils.matchNote(note, engine.schemas);
        const schema = _.find(schemaDomain.nodes, {
          id: "baz.ns",
        }) as Schema;
        expect(schemaMatch.toRawProps()).toEqual(schema.toRawProps());
      });
    });
  });

  describe("note", () => {
    beforeEach(() => {
      root = EngineTestUtils.setupStoreDir();
      engine = DendronEngine.getOrCreateEngine({
        root,
        forceNew: true,
        mode: "exact",
      });
    });

    afterEach(() => {
      // expect(actualFiles).toEqual(expectedFiles);
      fs.removeSync(root);
    });

    describe("basic", () => {
      test("create when empty", async () => {
        fs.removeSync(root);
        root = EngineTestUtils.setupStoreDir({ copyFixtures: true });
        engine = DendronEngine.getOrCreateEngine({
          root,
          forceNew: true,
          mode: "exact",
        });
        await engine.init();
        let schema = engine.schemas["foo"];
        let note = engine.notes["foo"];
        testUtilsCommonAll.expectSnapshot(expect, "foo", note);
        expect(schema.toRawProps()).toEqual(note.schema?.toRawProps());

        schema = _.find(schema.children, { id: "one" }) as Schema;
        note = engine.notes["foo.one"];
        expect(schema.toRawProps()).toEqual(note.schema?.toRawProps());

        schema = Schema.createUnkownSchema();
        note = engine.notes["foo.three.alpha"];
        expect(schema.toRawProps()).toEqual(note.schema?.toRawProps());

        // testUtilsCommonAll.expectSnapshot(
        //   expect,
        //   "notes",
        //   _.values(engine.notes)
        // );
        // testUtilsCommonAll.expectSnapshot(
        //   expect,
        //   "schemas",
        //   _.values(engine.schemas)
        // );
        // const { content, data } = FileTestUtils.readMDFile(root, "root.md");
        // expect(content).toMatchSnapshot("notes-root-content");
        // expect(
        //   testUtilsCommonAll.omitEntropicProps(data as DNodeRawProps)
        // ).toMatchSnapshot("notes-root-data");
        // [expectedFiles, actualFiles] = FileTestUtils.cmpFiles(
        //   root,
        //   ["root.md"],
        //   {}
        // );
      });

      test("create node", async () => {
        await engine.init();
        const bazNote = new Note({ id: "baz", fname: "baz" });
        bazNote.body = "baz.body";
        await engine.write(bazNote, { newNode: true });
        const baz = await engine.queryOne("baz", "note");
        // FIXME: the ids change, need a better way to test
        let bazMd = FileTestUtils.readMDFile(root, "baz.md");

        bazMd.data = stripEntropicData(bazMd.data);
        // @ts-ignore
        bazMd = _.omit(bazMd, ["path"]);
        expect(bazMd).toMatchSnapshot("bazMd");
        expect(stripEntropicData(baz.data.toRawProps())).toMatchSnapshot(
          "bazNode"
        );

        [expectedFiles, actualFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore(),
          { add: ["baz.md"] }
        );
      });

      test("fetch node", async () => {
        await engine.init();
        testUtilsCommonAll.expectSnapshot(
          expect,
          "main",
          _.values(engine.notes)
        );
        // foo should be fully specified
        const resp = await engine.query("foo", queryMode);
        expect(resp.data[0].title).toEqual("foo");
        expect(resp.data[0].created).toEqual(123);
        expect(resp.data[0].updated).toEqual(456);
        [expectedFiles, actualFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore()
        );
      });

      test("fetch node with custom att", async () => {
        await engine.init();
        const resp = await engine.query("foo.one", queryMode);
        expect(resp.data[0].title).toEqual("foo.one");
        expect(resp.data[0].custom).toEqual({ bond: 42 });
        // @ts-ignore
        expect(resp.data[0].toRawProps()).toMatchSnapshot();
        [expectedFiles, actualFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore()
        );
      });

      test("write node with custom att", async () => {
        await engine.init();
        const note: Note = (await engine.query("foo.one", queryMode))
          .data[0] as Note;
        note.body = "foo.one.body";
        await engine.write(note);

        // check written note is still equal
        const noteUpdated: Note = (await engine.query("foo.one", queryMode))
          .data[0] as Note;
        expect(_.omit(note.toRawProps(), "body")).toEqual(
          _.omit(noteUpdated.toRawProps(), "body")
        );
        expect(_.trim(noteUpdated.body)).toEqual("foo.one.body");

        // check custom att is in file
        const { data } = FileTestUtils.readMDFile(root, "foo.one.md");
        expect(stripEntropicData(data)).toEqual({
          bond: 42,
          desc: "",
          id: "foo.one",
          title: "foo.one",
          stub: false,
        });

        [expectedFiles, actualFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore()
        );
      });

      test("add custom att to node", async () => {
        await engine.init();
        const note: Note = (await engine.query("foo", queryMode))
          .data[0] as Note;
        // add custom att
        note.custom.bond = true;
        await engine.write(note);
        const noteUpdated: Note = (await engine.query("foo", queryMode))
          .data[0] as Note;

        // check note has custom att
        expect(_.omit(note.toRawProps(), "body")).toEqual(
          _.omit(noteUpdated.toRawProps(), "body")
        );
        // check custom att in file
        const { data } = FileTestUtils.readMDFile(root, "foo.md");
        expect(stripEntropicData(data)).toEqual({
          bond: true,
          desc: "",
          id: "foo",
          title: "foo",
          stub: false,
        });

        [expectedFiles, actualFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore()
        );
      });

      test("node has same attributes when re-initializing engine", async () => {
        await engine.init();
        const root1: Note = engine.notes.foo;
        const engine2 = DendronEngine.getOrCreateEngine({
          root,
          forceNew: true,
          mode: "exact",
        });
        await engine2.init();
        const root2: Note = engine2.notes.foo;
        // TODO: don't omit when we fix stub nodes
        const [root1Raw, root2Raw] = _.map(
          [root1.toRawProps(), root2.toRawProps()],
          (ent) => _.omit(ent, "children")
        );
        expect(root1Raw).toEqual(root2Raw);
        [expectedFiles, actualFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore()
        );
      });

      test("updateNode", async () => {
        await engine.init();
        testUtilsCommonAll.expectSnapshot(
          expect,
          "main",
          _.values(engine.notes)
        );
        const bazNote = new Note({ fname: "baz" });
        // foo should be fully specified
        await engine.updateNodes([bazNote], {
          newNode: true,
          parentsAsStubs: true,
        });
        const baz = await engine.queryOne("baz", "note");
        expect(
          testUtilsCommonAll.omitEntropicProps(baz.data.toRawProps())
        ).toMatchSnapshot("bazNote");
        [expectedFiles, actualFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore()
        );
      });
    });

    describe("main", () => {
      test("open stub node", async () => {
        FileTestUtils.writeMDFile(root, "bar.two.md", {}, "bar.two.body");
        engine = DendronEngine.getOrCreateEngine({
          root,
          forceNew: true,
          mode: "exact",
        });
        await engine.init();
        expect(fs.readdirSync(root)).toMatchSnapshot("listDir");
        testUtilsCommonAll.expectSnapshot(
          expect,
          "main",
          _.values(engine.notes)
        );
        const resp = engine.query("bar.two", queryMode);
        expect((await resp).data[0].fname).toEqual("bar.two");

        const resp2 = engine.query("bar", queryMode);
        expect((await resp2).data[0].fname).toEqual("bar");
        expect(fs.readdirSync(root)).toMatchSnapshot("listDir2");

        [expectedFiles, actualFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore(),
          {
            add: ["bar.two.md"],
          }
        );
      });

      test("delete node with no children", async () => {
        await engine.init();
        const numNodesPre = _.values(engine.notes).length;
        const fooNode = await engine.queryOne("foo.one", "note");
        await engine.delete(fooNode.data.id, "note");
        // should be less nodes
        expect(numNodesPre - 1).toEqual(_.values(engine.notes).length);
        const resp = await engine.query("foo", "note");
        // start of with three foo nodes, end up with two
        expect(resp.data.length).toEqual(4);
        // file should not be there
        [expectedFiles, actualFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore(),
          {
            remove: ["foo.one.md"],
          }
        );
      });

      test("delete node with children", async () => {
        await engine.init();
        const fooNode = await engine.queryOne("foo", "note");

        // delete foo
        await engine.delete(fooNode.data.id, "note");
        expect(fs.readdirSync(root)).toMatchSnapshot("listDi2");
        const numNodesPre = _.values(engine.notes).length;
        testUtilsCommonAll.expectSnapshot(
          expect,
          "main",
          _.values(engine.notes)
        );

        // because foo has children, exepect it to still exist as a stub
        const deletedNode = engine.notes[fooNode.data.id];
        expectNoteProps(expect, deletedNode, { fname: "foo", stub: true });

        // size should be the same
        expect(numNodesPre).toEqual(_.values(engine.notes).length);
        testUtilsCommonAll.expectSnapshot(
          expect,
          "main2",
          _.values(engine.notes)
        );
        // foo file should be deleted
        [expectedFiles, actualFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore(),
          {
            remove: ["foo.md"],
          }
        );
      });
    });

    describe("edge", () => {
      test("md exist, no schema file", async () => {
        fs.unlinkSync(path.join(root, "foo.schema.yml"));
        engine = DendronEngine.getOrCreateEngine({
          root,
          forceNew: true,
          mode: "exact",
        });
        await engine.init();
        expect(fs.readdirSync(root)).toMatchSnapshot("listDir");
        testUtilsCommonAll.expectSnapshot(
          expect,
          "main",
          _.values(engine.notes)
        );
        const resp = engine.query("root", "schema");
        expect((await resp).data[0].fname).toEqual("root.schema");
        [actualFiles, expectedFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore(),
          {
            add: [],
            remove: ["foo.schema.yml"],
          }
        );
      });

      test("no md file, schema exist", async () => {
        fs.unlinkSync(path.join(root, "root.md"));
        engine = DendronEngine.getOrCreateEngine({
          root,
          forceNew: true,
          mode: "exact",
        });
        await engine.init();
        expect(fs.readdirSync(root)).toMatchSnapshot("listDir");
        testUtilsCommonAll.expectSnapshot(
          expect,
          "main",
          _.values(engine.notes)
        );
        const fooNote = (await engine.query("foo", "note")).data[0];
        expect(fooNote.fname).toEqual("foo");
        // @ts-ignore
        testUtilsCommonAll.expectSnapshot(expect, "fooNote", fooNote);
        [actualFiles, expectedFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore(),
          {}
        );
      });

      test("no md file, no schema ", async () => {
        fs.unlinkSync(path.join(root, "foo.schema.yml"));
        fs.unlinkSync(path.join(root, "root.md"));
        engine = DendronEngine.getOrCreateEngine({
          root,
          forceNew: true,
          mode: "exact",
        });
        await engine.init();
        expect(fs.readdirSync(root)).toMatchSnapshot("listDir");
        testUtilsCommonAll.expectSnapshot(
          expect,
          "main",
          _.values(engine.notes)
        );
        const resp = engine.query("root", "note");
        expect((await resp).data[0].fname).toEqual("root");
        [actualFiles, expectedFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore(),
          {
            add: [],
            remove: ["foo.schema.yml"],
          }
        );
      });

      test("note without id", async () => {
        fs.unlinkSync(path.join(root, "foo.md"));
        FileTestUtils.writeMDFile(root, "foo.md", {}, "this is foo");
        engine = DendronEngine.getOrCreateEngine({
          root,
          forceNew: true,
          mode: "exact",
        });
        await engine.init();
        [actualFiles, expectedFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore(),
          {}
        );
        const fooNote = (await engine.query("foo", "note")).data[0];
        expect(fooNote.fname).toEqual("foo");
        // @ts-ignore
        testUtilsCommonAll.expectSnapshot(expect, "fooNote", fooNote);
      });

      test("note without fm", async () => {
        fs.unlinkSync(path.join(root, "foo.md"));
        fs.writeFileSync(path.join(root, "foo.md"), "this is foo");
        engine = DendronEngine.getOrCreateEngine({
          root,
          forceNew: true,
          mode: "exact",
        });
        await engine.init();
        const fooNote = (await engine.query("foo", "note")).data[0];
        expect(fooNote.fname).toEqual("foo");
        // @ts-ignore
        testUtilsCommonAll.expectSnapshot(expect, "fooNote", fooNote);
        [actualFiles, expectedFiles] = FileTestUtils.cmpFiles(
          root,
          LernaTestUtils.fixtureFilesForStore(),
          {}
        );
      });

      test("one note without domain", async () => {
        root = EngineTestUtils.setupStoreDir({ copyFixtures: false });
        engine = DendronEngine.getOrCreateEngine({
          root,
          forceNew: true,
          mode: "exact",
        });
        FileTestUtils.writeMDFile(root, "root.md", { id: "root" }, "root");
        const fname = "backlog.journal.2020";
        FileTestUtils.writeMDFile(
          root,
          fname + ".md",
          { id: "backlog" },
          "backlog"
        );
        await engine.init();
        const note = new Note({ id: "backlog", fname });
        const [t1, t2] = _.map([engine.notes["backlog"], note], (n) => {
          return testUtilsCommonAll.omitEntropicProps(
            n.toRawProps(true, { ignoreNullParent: true })
          );
        });

        expect(t1).toEqual(t2);
      });

      test("queryOne on existing stub node", async () => {
        root = EngineTestUtils.setupStoreDir({ copyFixtures: false });
        node2MdFile(new Note({ fname: "foo" }), { root });
        node2MdFile(new Note({ fname: "foo.one.alpha" }), { root });
        engine = DendronEngine.getOrCreateEngine({
          root,
          forceNew: true,
          mode: "exact",
        });
        await engine.init();
        const stubNode = DNodeUtils.getNoteByFname("foo.one", engine) as Note;
        expect(stubNode.stub).toBeTruthy();
        const resp = await engine.queryOne("foo.one", "note", {
          createIfNew: true,
        });
        const createdNode = resp.data;
        // expect(stubNode.toRawProps()).toMatchSnapshot("stub");
        // expect(createdNode.toRawProps()).toMatchSnapshot("created");
        expect(stubNode.id).toEqual(createdNode.id);
        expect(createdNode.stub).toBeFalsy();
      });

      test("note with time stamp as title", async () => {
        root = EngineTestUtils.setupStoreDir({ copyFixtures: false });
        fs.writeFileSync(
          path.join(root, "root.md"),
          "---\nid: root\ntitle: root\n---",
          { encoding: "utf8" }
        );
        fs.writeFileSync(
          path.join(root, "foo.md"),
          "---\ntitle: 2020-08-01\n---",
          { encoding: "utf8" }
        );
        engine = DendronEngine.getOrCreateEngine({
          root,
          forceNew: true,
          mode: "exact",
        });
        await engine.init();
        const node = DNodeUtils.getNoteByFname("foo", engine) as Note;
        expect(node.title).toEqual("2020-08-01");
      });
    });
  });
});
