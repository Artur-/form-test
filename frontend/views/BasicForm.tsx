import { Button } from "@hilla/react-components/Button.js";
import { Checkbox } from "@hilla/react-components/Checkbox.js";
import { DatePicker } from "@hilla/react-components/DatePicker.js";
import { Notification } from "@hilla/react-components/Notification.js";
import { TextField } from "@hilla/react-components/TextField.js";
import { useBinder, useField } from "Frontend/form/binder";
import PersonModel from "Frontend/generated/com/example/application/endpoints/helloreact/PersonModel";

export function BasicForm() {
  const binder = useBinder(PersonModel);
  const name = useField(binder.model.name);
  const dateOfBirth = useField(binder.model.dateOfBirth);
  const subscribe = useField(binder.model.subscribe);
//   const otherEmail = useField(binder.model.otherEmail);

  console.log("render", binder.value?.subscribe);
  return (
    <>
      <section className="flex p-m gap-m items-end">
        <TextField label="Your name" {...name} />
        <DatePicker label="Date of Birth" {...dateOfBirth} />
        <Checkbox label="Subscribe to newsletter" {...subscribe} />
        {(binder.root.value as any).subscribe ? (
          <TextField label="Other email address (leave blank to use your default)" />
        ) : null}
        <Button
          onClick={async () => {
            Notification.show(JSON.stringify(binder.root.value));
          }}
        >
          Say hello
        </Button>
      </section>
    </>
  );
}
