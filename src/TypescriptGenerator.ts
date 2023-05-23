import { DataverseGenOptions, defaultOptions } from "./MetadataGeneratorConfig";
import _merge = require("lodash.merge");
import ejs = require("ejs");
import path = require("path");
import { SchemaModel } from "./SchemaModel";
import { CodeWriter } from "./CodeWriter";
import { TemplateProvider } from "./TemplateProvider";
import { DefaultLogger, ILoggerCallback } from "./Logger";

export class TypescriptGenerator {
  options: DataverseGenOptions;
  model: SchemaModel;
  codeWriter: CodeWriter;
  templateProvider: TemplateProvider;
  fileNames: string[] = [];
  logger: ILoggerCallback;
  constructor(
    model: SchemaModel,
    codeWriter: CodeWriter,
    templateProvider: TemplateProvider,
    options: DataverseGenOptions,
    logger?: ILoggerCallback,
  ) {
    this.model = model;
    this.codeWriter = codeWriter;
    this.templateProvider = templateProvider;
    this.options = {};
    this.logger = logger || DefaultLogger;
    _merge(this.options, defaultOptions, options);
  }

  async generate(): Promise<void> {
    // Load the template
    if (!this.options.output?.templateRoot) throw new Error("Missing templateRoot in config");
    if (!this.options.output?.outputRoot) throw new Error("Missing outputRoot in config");

    this.fileNames = [];
    this.outputAllAttributeTypes(this.model);
    this.outputEntities(this.model);
    this.outputEnums(this.model);
    this.outputActions(this.model);
    this.outputFunctions(this.model);
    this.outputComplexTypes(this.model);
    this.outputFiles("metadata.ejs", ".", [{ ...this.model, ...this.options }], function () {
      return "metadata";
    });
    if (this.options.generateIndex) {
      this.outputFiles(
        "index.ejs",
        ".",
        [{ ...this.model, ...this.options, ...{ FileNames: this.fileNames } }],
        function () {
          return "index";
        },
      );
    }
  }
  async outputAllAttributeTypes(schema: SchemaModel): Promise<void> {
    const allEntities = schema.EntityTypes.map((entity) => ({
      Name: entity.Name, // preserve the original 'Name'
      entityName: entity.Name,
      properties: entity.Properties.map((property) => ({
        ...property,
        importLocation: property.TypescriptType?.importLocation,
      })),
    }));

    const allEnums = schema.EnumTypes.map((enumType) => ({
      Name: enumType.Name, // preserve the original 'Name'
      enumName: enumType.Name,
      members: enumType.Members ?? [], // use nullish coalescing operator
    }));

    // const allEnums = schema.EnumTypes.map((enumType) => ({
    //   enumName: enumType.Name,
    //   members: enumType.Members
    //     ? enumType.Members.map((member) => ({
    //         ...member,
    //       }))
    //     : [],
    // }));

    const outFile = "./typings/attributeTypes.d.ts";
    this.logger("Generating: " + outFile);

    const template = this.templateProvider.getTemplate("allAttributeTypes.ejs");

    if (template) {
      allEntities.forEach((entity) => {
        entity.properties.forEach((prop) => {
          // console.log(prop);
          if (prop.importLocation?.startsWith("..")) {
            prop.importLocation = prop.importLocation.replace("..", ".");
          }
        });
      });
      let output = "";
      try {
        output = ejs.render(template, { entities: allEntities, enums: allEnums });
      } catch (error) {
        console.error("Error rendering EJS template:", error);
      }
      // this.fileNames.push(outFile);
      this.codeWriter.write(outFile, output);
    } else {
      this.logger("Skipping - no template found 'allAttributeTypes.ejs'");
    }
  }

  // tis works - commented as trying to add enums above
  // async outputAllAttributeTypes(schema: SchemaModel): Promise<void> {
  //   const allEntities = schema.EntityTypes.map((entity) => ({
  //     entityName: entity.Name,
  //     properties: entity.Properties.map((property) => ({
  //       ...property,
  //       importLocation: property.TypescriptType?.importLocation,
  //     })),
  //   }));

  //   const outFile = "attributeTypes.d.ts";
  //   this.logger("Generating: " + outFile);

  //   const template = this.templateProvider.getTemplate("allAttributeTypes.ejs");

  //   if (template) {
  //     allEntities.forEach((entity) => {
  //       entity.properties.forEach((prop) => {
  //         console.log(prop);
  //         if (prop.importLocation?.startsWith("..")) {
  //           prop.importLocation = prop.importLocation.replace("..", ".");
  //         }
  //       });
  //     });
  //     let output = "";
  //     try {
  //       output = ejs.render(template, { entities: allEntities });
  //     } catch (error) {
  //       console.error("Error rendering EJS template:", error);
  //     }
  //     this.fileNames.push(outFile);
  //     this.codeWriter.write(outFile, output);
  //   } else {
  //     this.logger("Skipping - no template found 'allAttributeTypes.ejs'");
  //   }
  // }

  outputEntities(schema: SchemaModel): void {
    this.outputFiles("entity.ejs", "entities", schema.EntityTypes as unknown[], this.schemaNameKey);
  }

  outputEnums(schema: SchemaModel): void {
    this.outputFiles("enum.ejs", "enums", schema.EnumTypes as unknown[], this.nameKey);
  }

  outputActions(schema: SchemaModel): void {
    this.outputFiles("action.ejs", "actions", schema.Actions as unknown[], this.nameKey);
  }

  outputFunctions(schema: SchemaModel): void {
    this.outputFiles("function.ejs", "functions", schema.Functions as unknown[], this.nameKey);
  }

  outputComplexTypes(schema: SchemaModel): void {
    this.outputFiles("complextype.ejs", "complextypes", schema.ComplexTypes as unknown[], this.nameKey);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nameKey(item: any): string {
    return item?.Name;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schemaNameKey(item: any): string {
    return item?.SchemaName;
  }

  outputFiles(
    templateFileName: string,
    outputDir: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    itemArray: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getFileName: (item: any) => string,
  ): void {
    if (itemArray.length === 0) {
      this.logger(`Skipping ${outputDir} due to zero items`);
      return;
    }

    // Create sub-output directory
    this.codeWriter.createSubFolder(outputDir);

    for (const item of itemArray) {
      const fileName = getFileName(item);
      const outFile = path.join(outputDir, `${fileName}${this.options.output?.fileSuffix}`);
      let output = "";
      try {
        this.logger("Generating: " + outFile);
        const template = this.templateProvider.getTemplate(templateFileName);
        if (template) {
          output = ejs.render(template, { ...this.options, ...item });
          this.fileNames.push(outFile);
        } else {
          this.logger(`Skipping - no template found '${templateFileName}'`);
        }
      } catch (ex) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const error = ex as any;
        output = error.message;
        console.error(error.message);
      }
      this.codeWriter.write(outFile, output);
    }
  }
}
