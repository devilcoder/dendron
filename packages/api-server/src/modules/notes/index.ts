import { DendronError, DEngineV2 } from "@dendronhq/common-all";
import {
  EngineDeletePayload,
  EngineDeleteRequest,
} from "@dendronhq/common-server";
import { MemoryStore } from "../../store/memoryStore";

export class NoteController {
  static singleton?: NoteController;

  static instance() {
    if (!NoteController.singleton) {
      NoteController.singleton = new NoteController();
    }
    return NoteController.singleton;
  }

  //   async create(req: SchemaWriteRequest): Promise<SchemaWritePayload> {
  //     const { ws, schema } = req;
  //     const engine = await MemoryStore.instance().get<DEngineV2>(`ws:${ws}`);
  //     if (!engine) {
  //       throw "No Engine";
  //     }
  //     try {
  //       await engine.writeSchema(schema);
  //       return { error: null, data: undefined };
  //     } catch (err) {
  //       return {
  //         error: new DendronError({ msg: JSON.stringify(err) }),
  //         data: undefined,
  //       };
  //     }
  //   }

  async delete({
    ws,
    id,
    opts,
  }: EngineDeleteRequest): Promise<EngineDeletePayload> {
    const engine = await MemoryStore.instance().get<DEngineV2>(`ws:${ws}`);
    if (!engine) {
      throw "No Engine";
    }
    try {
      const data = await engine.deleteNote(id, opts);
      return data;
    } catch (err) {
      return {
        error: new DendronError({ msg: JSON.stringify(err) }),
        data: undefined,
      };
    }
  }
}
