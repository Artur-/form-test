import { AbstractModel, Validator } from "@hilla/form";
import { Button } from "@hilla/react-components/Button.js";
import { Notification } from "@hilla/react-components/Notification.js";
import {
  TextField,
  TextFieldElement,
} from "@hilla/react-components/TextField.js";
import { FieldDirectiveResult, useBinder } from "@hilla/react-form";
import Person from "Frontend/generated/com/example/application/endpoints/helloreact/Person";
import PersonModel from "Frontend/generated/com/example/application/endpoints/helloreact/PersonModel";
import { useRef } from "react";

export default function CrossFieldValidationForm() {
  const binder = useBinder(PersonModel);
  const field = binder.field as <M extends AbstractModel<any>>(
    model: M
  ) => FieldDirectiveResult;
  const email = field(binder.model.email);
  const otherEmail = field(binder.model.otherEmail);

  const binder2 = useBinder(PersonModel);
  const field2 = binder2.field as <M extends AbstractModel<any>>(
    model: M
  ) => FieldDirectiveResult;
  const email2 = field2(binder2.model.email);
  const uiOnlyEmailRef = useRef<TextFieldElement>(null);
  console.log("render", binder.value?.subscribe);
  return (
    <>
      <section className="flex p-m gap-m items-end">
        <h2>Model validation (two values in bean)</h2>
        <TextField label="Your email" {...email} />
        <TextField label="Your email again" {...otherEmail} />
        <Button
          onClick={async () => {
            Notification.show(JSON.stringify(binder.value));

            const validator: Validator<Person> = {
              message:
                "The emails do not match. Please check that it is written correctly in both fields.",
              validate: (value: Person) => {
                if (value.email != value.otherEmail) {
                  // Always mark the second field as invalid even though the first might be wrong
                  return [{ property: binder.model.otherEmail }];
                }
                return true;
              },
            };
            binder.setValidators([...binder.validators, validator]);
          }}
        >
          Say hello
        </Button>
      </section>
      <section className="flex p-m gap-m items-end">
        <h2>UI only validation (one value in bean)</h2>
        <TextField label="Your email" ref={uiOnlyEmailRef} />
        <TextField label="Your email again" {...email2} />
        <Button
          onClick={async () => {
            Notification.show(JSON.stringify(binder2.value));

            const validator: Validator<Person> = {
              message:
                "The emails do not match. Please check that it is written correctly in both fields.",
              validate: (value: Person) => {
                if (value.email != uiOnlyEmailRef.current!.value) {
                  // Always mark the second field as invalid even though the first might be wrong
                  return [{ property: binder2.model.email }];
                }
                return true;
              },
            };
            binder2.setValidators([...binder2.validators, validator]);
          }}
        >
          Say hello
        </Button>
      </section>
    </>
  );
}
